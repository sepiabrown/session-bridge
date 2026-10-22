import { describe, expect, test } from "bun:test"
import { resolve } from "../src/current_requests.ts"
import { openCodeCurrentRequest } from "../src/current_requests/open_code.ts"
import { checkpointConversation, OpenCodeHarness } from "./open_code_harness.ts"

describe("OpenCode current request", () => {
  test("resolves the parent user message as the excluded boundary", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "latest", messages: checkpointConversation() })

    const current = await resolve(openCodeCurrentRequest, {
      client,
      sessionID: "source",
      assistantMessageID: "checkpoint-response",
      directory: "C:/project",
      endpoint: "http://localhost:4096",
    })

    expect(current.excludedMessageID).toBe("checkpoint-request")
    expect(current.invocationMessageID).toBe("checkpoint-response")
    expect(current.expectedCheckpointMessageCount).toBeUndefined()
    expect(current.confidence).toBe("exact")
    expect(client.messageListRequests).toBe(0)
  })

  test("resolves the parent request across assistant continuation messages", async () => {
    const client = new OpenCodeHarness()
    const messages = checkpointConversation()
    messages.splice(3, 0, {
      info: {
        id: "earlier-continuation",
        sessionID: "source",
        role: "assistant",
        parentID: "checkpoint-request",
      },
      parts: [],
    })
    client.addSession({ id: "source", title: "latest", messages })

    const current = await resolve(openCodeCurrentRequest, {
      client,
      sessionID: "source",
      assistantMessageID: "checkpoint-response",
      directory: "C:/project",
      endpoint: "http://localhost:4096",
    })

    expect(current.excludedMessageID).toBe("checkpoint-request")
    expect(current.expectedCheckpointMessageCount).toBeUndefined()
    expect(client.messageListRequests).toBe(0)
  })
})
