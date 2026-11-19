import type { Plugin } from "@opencode/plugin"
import { OpenCode, type OpenCodeClient } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { FileReplayLedger } from "./checkpoint_authorizations/replay_ledger.ts"
import { SignedReceiptService } from "./checkpoint_authorizations/receipts.ts"
import { FileOperationJournal } from "./checkpoint_operations.ts"
import { continuationBase, firstUnusedPrefix, hasForkSuffix, readScopedPrefix } from "./continuation_titles/open_code.ts"
import { checkpointSession, type CurrentRequest } from "./session_bridge.ts"
import type { ContinuationTitleMethod } from "./continuation_titles.ts"
import type { SessionCheckpointMethod } from "./session_checkpoints.ts"

const argumentsSchema = z.object({
  workingFolders: z.array(z.string().min(1)).min(1).describe("Repository folders represented by this checkpoint"),
  worktreeSuffixDelimiter: z.string().min(1).max(16).optional(),
  checkpointTitle: z.string().min(1).max(200).optional(),
  continuationTitle: z.string().min(1).max(200).optional(),
})

export async function setupOpenCodeV2(context: Plugin.Context) {
  const server = z.object({ url: z.string().url(), headers: z.record(z.string(), z.string()).optional() }).optional().parse(context.options.server)
  let connection: { client: OpenCodeClient; url: string } | undefined
  async function connect() {
    if (connection) return connection
    if (server) return connection = { client: OpenCode.make({ baseUrl: server.url, ...(server.headers ? { headers: server.headers } : {}) }), url: server.url }
    const channel = context.app.channel
    const file = ["latest", "dev", "beta", "next"].includes(channel) ? undefined
      : join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "opencode", `service-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`)
    const endpoint = await Service.discover({ version: context.app.version, ...(file ? { file } : {}) })
    if (!endpoint) throw new Error("Session Bridge: no matching managed OpenCode service; configure plugin options.server for an explicit or standalone server.")
    return connection = { client: OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers({ url: endpoint.url, ...(endpoint.auth ? { auth: endpoint.auth } : {}) }) }), url: endpoint.url }
  }
  const authorizations = { receipts: await SignedReceiptService.create(), replay: new FileReplayLedger() }
  const operations = new FileOperationJournal()
  // V2 assistant messages have no parentID. Capture the actual model-request boundary,
  // not a later prompt-admission event (which may be queued or cancelled).
  const requests = new Map<string, string[]>()
  await context.session.hook("context", (event) => {
    const candidates = [...event.messages].reverse().flatMap((message) =>
      message.role === "user" && message.id ? [message.id] : [])
    if (candidates.length) requests.set(event.sessionID, candidates)
    else requests.delete(event.sessionID)
  })

  const methods: SessionCheckpointMethod[] = [{
    harness: "open-code",
    async create(input) {
      const { client } = await connect()
      const sessionID = input.current.sessionID
      const checkpoint = await client.session.fork({ sessionID, before: input.current.excludedMessageID })
      await input.operation.record("checkpoint-created", { checkpointSessionID: checkpoint.id })
      await context.session.update({ sessionID: checkpoint.id, title: input.names.checkpointTitle })
      await input.operation.record("checkpoint-renamed")
      await context.session.update({ sessionID, title: input.names.continuationTitle })
      await input.operation.record("continuation-renamed")
      const [saved, continuation] = await Promise.all([
        context.session.get({ sessionID: checkpoint.id }), context.session.get({ sessionID }),
      ])
      if (saved.title !== input.names.checkpointTitle || continuation.title !== input.names.continuationTitle)
        throw new Error("OpenCode did not preserve the requested checkpoint and continuation titles.")
      await input.operation.record("verified")
      return { checkpointSessionID: checkpoint.id }
    },
  }]
  const continuationTitles: ContinuationTitleMethod[] = [{
    harness: "open-code",
    async allocate(input) {
      const session = await context.session.get({ sessionID: input.current.sessionID })
      if (!session.title) throw new Error("The active OpenCode session has no title.")
      const titles: string[] = []
      let page = await context.session.list({ directory: input.current.directory, limit: 100 })
      while (true) {
        titles.push(...page.data.flatMap((entry) => entry.title === undefined ? [] : [entry.title]))
        if (!page.cursor.next) break
        // Cursors retain the filters; repeating them can invalidate the cursor.
        page = await context.session.list({ cursor: page.cursor.next, limit: 100 })
      }
      const scope = input.scope
      if (!scope) throw new Error("OpenCode V2 continuation allocation requires a working-folder scope.")
      const retained = readScopedPrefix(session.title, scope)
      const prefix = input.advancePrefix || (retained !== undefined && hasForkSuffix(session.title))
        ? firstUnusedPrefix(titles, scope, retained === undefined ? 0 : retained + 1)
        : retained ?? firstUnusedPrefix(titles, scope)
      return `${String(prefix).padStart(2, "0")} ${continuationBase(input.checkpointTitle, scope)}`
    },
  }]

  await context.tool.transform((editor) => {
    editor.add({
      name: "session_checkpoint",
      description: "Fork this conversation immediately before the current user request, title the checkpoint, and retitle the active continuation. Omit continuationTitle for scoped NN allocation.",
      input: z.toJSONSchema(argumentsSchema),
      options: { codemode: true },
      async execute(raw, invocation) {
        if (typeof context.permission.assert !== "function")
          throw new Error("Session Bridge requires the native V2 permission.assert API. Restart or update the background server; a newer TUI alone does not update it.")
        const args = argumentsSchema.parse(raw)
        const { client, url } = await connect()
        const candidates = requests.get(invocation.sessionID)
        if (!candidates) throw new Error("No verified OpenCode V2 model-request boundary was captured; retry on a new model step.")
        const [session, assistant] = await Promise.all([
          context.session.get({ sessionID: invocation.sessionID }),
          client.session.message.get({ sessionID: invocation.sessionID, messageID: invocation.messageID }),
        ])
        if (assistant.type !== "assistant") throw new Error(`OpenCode V2 invocation must be an assistant message; got ${assistant.type}.`)
        let requestID: string | undefined
        for (const candidate of candidates) {
          const message = await client.session.message.get({ sessionID: invocation.sessionID, messageID: candidate })
          // Synthetic messages and shell notices are rendered as user-role model messages.
          // Only a persisted real user message can authorize the checkpoint boundary.
          if (message.type === "user") { requestID = message.id; break }
        }
        if (!requestID) throw new Error("The OpenCode V2 model request contains no persisted real user request.")
        if (!session.title) throw new Error("The active OpenCode session has no title.")
        await context.permission.assert({
          sessionID: invocation.sessionID, agent: invocation.agent,
          source: { type: "tool", messageID: invocation.messageID, id: invocation.id },
          action: "session_checkpoint", resources: [invocation.sessionID], save: [],
        })
        const current: CurrentRequest = {
          harness: "open-code", sessionID: session.id, excludedMessageID: requestID,
          invocationMessageID: assistant.id, activeTitle: session.title,
          directory: session.location.directory, endpoint: url,
          confidence: "verified", evidence: "OpenCode V2 context-hook model request user ID, verified through bounded single-message reads",
        }
        const result = await checkpointSession({
          authorization: { type: "trusted-invocation", current },
          workingFolders: args.workingFolders,
          ...(args.worktreeSuffixDelimiter ? { worktreeSuffixDelimiter: args.worktreeSuffixDelimiter } : {}),
          names: {
            ...(args.checkpointTitle ? { checkpointTitle: args.checkpointTitle } : {}),
            ...(args.continuationTitle ? { continuationTitle: args.continuationTitle } : {}),
          },
        }, { authorizations, operations, continuationTitles, methods })
        return { content: result.status === "complete"
          ? `Checkpoint created: ${result.checkpointTitle}\nContinuation: ${result.continuationTitle}`
          : JSON.stringify(result, null, 2) }
      },
    })
  })
  return () => { requests.clear() }
}
