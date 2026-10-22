import type { SessionCheckpointMethod } from "../session_checkpoints.ts"
import type { CurrentRequest } from "../session_bridge.ts"
import { unwrap, type OpenCodeClient } from "../open_code_contract.ts"

export function createOpenCodeCheckpointMethod(
  source: OpenCodeClient | ((current: CurrentRequest) => OpenCodeClient),
): SessionCheckpointMethod {
  return {
    harness: "open-code",
    async create(input) {
      const client = typeof source === "function" ? source(input.current) : source
      const directory = input.current.directory
      const query = directory ? { directory } : undefined
      await unwrap(
        client.session.get({ path: { id: input.current.sessionID }, ...(query ? { query } : {}) }),
        "read the active OpenCode session",
      )

      const checkpoint = await unwrap(
        client.session.fork({
          path: { id: input.current.sessionID },
          ...(query ? { query } : {}),
          body: { messageID: input.current.excludedMessageID },
        }),
        "fork the OpenCode session",
      )
      await input.operation.record("checkpoint-created", { checkpointSessionID: checkpoint.id })

      await unwrap(
        client.session.update({
          path: { id: checkpoint.id },
          ...(query ? { query } : {}),
          body: { title: input.names.checkpointTitle },
        }),
        "rename the checkpoint session",
      )
      await input.operation.record("checkpoint-renamed")

      await unwrap(
        client.session.update({
          path: { id: input.current.sessionID },
          ...(query ? { query } : {}),
          body: { title: input.names.continuationTitle },
        }),
        "rename the active continuation session",
      )
      await input.operation.record("continuation-renamed")

      const [savedCheckpoint, savedContinuation] = await Promise.all([
        unwrap(
          client.session.get({ path: { id: checkpoint.id }, ...(query ? { query } : {}) }),
          "verify the checkpoint session",
        ),
        unwrap(
          client.session.get({ path: { id: input.current.sessionID }, ...(query ? { query } : {}) }),
          "verify the continuation session",
        ),
      ])
      if (savedCheckpoint.title !== input.names.checkpointTitle) {
        throw new Error("OpenCode did not preserve the requested checkpoint title.")
      }
      if (savedContinuation.title !== input.names.continuationTitle) {
        throw new Error("OpenCode did not preserve the requested continuation title.")
      }
      await input.operation.record("verified")
      return { checkpointSessionID: checkpoint.id }
    },
  }
}
