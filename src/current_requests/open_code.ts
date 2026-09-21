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
    const messages = await unwrap(
      input.client.session.messages({
        path: { id: input.sessionID },
        query: { directory: input.directory },
      }),
      "read OpenCode session messages",
    )
    const assistantIndex = messages.findIndex((message) => message.info.id === input.assistantMessageID)
    if (assistantIndex < 0) throw new Error("The current OpenCode assistant message is absent from session history.")

    const assistant = messages[assistantIndex]!.info
    if (assistant.role !== "assistant") throw new Error("The current OpenCode invocation message is not an assistant message.")
    const requestIndex = messages.findIndex((message) => message.info.id === assistant.parentID)
    if (requestIndex < 0) throw new Error("The current OpenCode assistant message has no resolvable parent request.")
    const request = messages[requestIndex]!.info
    if (request.role !== "user") throw new Error("The current OpenCode assistant parent is not a user request.")

    const current: CurrentRequest = {
      harness: "open-code",
      sessionID: input.sessionID,
      excludedMessageID: request.id,
      invocationMessageID: assistant.id,
      expectedCheckpointMessageCount: requestIndex,
      directory: input.directory,
      endpoint: input.endpoint,
      confidence: "exact",
      evidence: "OpenCode tool context assistant message -> persisted assistant.parentID -> user request",
    }
    return current
  },
}
