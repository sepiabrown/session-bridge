import type { CurrentRequestMethod } from "../current_requests.ts"
import type { CurrentRequest } from "../session_bridge.ts"
import { unwrap, type OpenCodeClient } from "../open_code_contract.ts"

export type OpenCodeInvocation = {
  client: OpenCodeClient
  sessionID: string
  assistantMessageID: string
  directory: string
  endpoint: string
}

export const openCodeCurrentRequest: CurrentRequestMethod<OpenCodeInvocation> = {
  harness: "open-code",
  async resolve(input) {
    const assistantMessage = await unwrap(
      input.client.session.message({
        path: { id: input.sessionID, messageID: input.assistantMessageID },
        query: { directory: input.directory },
      }),
      "read the current OpenCode assistant message",
    )
    const assistant = assistantMessage.info
    if (assistant.role !== "assistant") throw new Error("The current OpenCode invocation message is not an assistant message.")
    const requestMessage = await unwrap(
      input.client.session.message({
        path: { id: input.sessionID, messageID: assistant.parentID },
        query: { directory: input.directory },
      }),
      "read the OpenCode parent request",
    )
    const request = requestMessage.info
    if (request.role !== "user") throw new Error("The current OpenCode assistant parent is not a user request.")

    const current: CurrentRequest = {
      harness: "open-code",
      sessionID: input.sessionID,
      excludedMessageID: request.id,
      invocationMessageID: assistant.id,
      directory: input.directory,
      endpoint: input.endpoint,
      confidence: "exact",
      evidence: "OpenCode tool context assistant ID -> persisted assistant.parentID -> persisted user request",
    }
    return current
  },
}
