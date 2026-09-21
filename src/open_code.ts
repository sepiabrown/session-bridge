import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { issueReceipt } from "./checkpoint_authorizations.ts"
import { FileReplayLedger } from "./checkpoint_authorizations/replay_ledger.ts"
import { SignedReceiptService } from "./checkpoint_authorizations/receipts.ts"
import { FileOperationJournal } from "./checkpoint_operations.ts"
import { createOpenCodeContinuationTitleMethod } from "./continuation_titles/open_code.ts"
import { resolve } from "./current_requests.ts"
import { openCodeCurrentRequest } from "./current_requests/open_code.ts"
import type { OpenCodeClient } from "./open_code_contract.ts"
import { checkpointSession, type CheckpointResult } from "./session_bridge.ts"
import { createOpenCodeCheckpointMethod } from "./session_checkpoints/open_code.ts"

const pluginSchema = tool.schema

const titleArguments = {
  checkpointTitle: pluginSchema.string().min(1).max(200).describe("Title for the checkpoint ending before this request"),
  continuationTitle: pluginSchema
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Optional explicit title override for the still-active conversation"),
}

export const SessionBridgePlugin: Plugin = async (input) => {
  const client = input.client as unknown as OpenCodeClient
  const receipts = await SignedReceiptService.create()
  const authorizations = { receipts, replay: new FileReplayLedger() }
  const operations = new FileOperationJournal()
  const continuationTitles = [createOpenCodeContinuationTitleMethod(client)]
  const methods = [createOpenCodeCheckpointMethod(client)]

  async function current(context: { sessionID: string; messageID: string; directory: string }) {
    return resolve(openCodeCurrentRequest, {
      client,
      sessionID: context.sessionID,
      assistantMessageID: context.messageID,
      directory: context.directory,
      endpoint: input.serverUrl.toString(),
    })
  }

  return {
    tool: {
      session_checkpoint: tool({
        description:
          "Fork this conversation immediately before the current user request, title that checkpoint, and retitle the still-active conversation.",
        args: titleArguments,
        async execute(args, context) {
          const coordinate = await current(context)
          await context.ask({
            permission: "session-checkpoint",
            patterns: [coordinate.sessionID],
            always: [],
            metadata: { coordinate, names: args },
          })
          const result = await checkpointSession(
            {
              authorization: { type: "trusted-invocation", current: coordinate },
              names: args,
            },
            { authorizations, operations, continuationTitles, methods },
          )
          return formatToolResult(result)
        },
      }),
      session_checkpoint_receipt: tool({
        description:
          "Issue a short-lived one-time receipt for MCP or CLI checkpointing of this exact conversation request boundary.",
        args: {},
        async execute(_args, context) {
          const coordinate = await current(context)
          await context.ask({
            permission: "session-checkpoint-receipt",
            patterns: [coordinate.sessionID],
            always: [],
            metadata: { coordinate },
          })
          const receipt = await issueReceipt(coordinate, authorizations)
          return JSON.stringify({ receipt, expiresInSeconds: 300, coordinate }, null, 2)
        },
      }),
    },
  }
}

export default SessionBridgePlugin

function formatToolResult(result: CheckpointResult) {
  if (result.status === "complete") {
    return `Checkpoint created: ${result.checkpointTitle}\nContinuation: ${result.continuationTitle}`
  }
  return JSON.stringify(result, null, 2)
}
