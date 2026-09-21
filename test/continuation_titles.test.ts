import { describe, expect, test } from "bun:test"
import { resolveContinuationTitle } from "../src/continuation_titles.ts"
import {
  createOpenCodeContinuationTitleMethod,
  firstUnusedPrefix,
  readCheckpointScope,
  readScopedPrefix,
} from "../src/continuation_titles/open_code.ts"
import type { CurrentRequest } from "../src/session_bridge.ts"
import { OpenCodeHarness } from "./open_code_harness.ts"

describe("continuation titles", () => {
  test("retains the current numeric prefix", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "03 session-bridge~previous", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "session-bridge~260917~abc1234~summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("03 session-bridge~260917~abc1234~summary")
  })

  test("allocates the smallest unused numeric prefix", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "ordinary session", messages: [] })
    client.addSession({ id: "slot-0", title: "00 session-bridge~first", messages: [] })
    client.addSession({ id: "slot-2", title: "02 session-bridge~third", messages: [] })
    client.addSession({ id: "other-slot-1", title: "01 codosa~other", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "session-bridge~260917~abc1234~summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("01 session-bridge~260917~abc1234~summary")
  })

  test("allocates independently when changing repository scope", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "03 codosa~previous", messages: [] })
    client.addSession({ id: "aoidosa-0", title: "00 aoidosa-nf~first", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "aoidosa-nf~260917~abc1234~summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("01 aoidosa-nf~260917~abc1234~summary")
  })

  test("starts at zero when only another scope uses zero", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "ordinary session", messages: [] })
    client.addSession({ id: "session-bridge-0", title: "00 session-bridge~first", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "aoidosa-nf~260917~abc1234~summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("00 aoidosa-nf~260917~abc1234~summary")
  })

  test("migrates a legacy latest title to the first numeric prefix", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "latest 00 previous", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "session-bridge~260917~abc1234~summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("00 session-bridge~260917~abc1234~summary")
  })

  test("preserves an explicit continuation title override", async () => {
    const names = await resolveContinuationTitle(
      {
        checkpointTitle: "260917___abc1234___summary",
        continuationTitle: "custom continuation",
      },
      currentRequest(),
      [],
    )

    expect(names.continuationTitle).toBe("custom continuation")
  })

  test("recognizes only leading numeric slots", () => {
    expect(readCheckpointScope("session-bridge~260917~abc1234~summary")).toBe("session-bridge")
    expect(readScopedPrefix("00 session-bridge~title", "session-bridge")).toBe(0)
    expect(readScopedPrefix("100 session-bridge~title", "session-bridge")).toBe(100)
    expect(readScopedPrefix("00 codosa~title", "session-bridge")).toBeUndefined()
    expect(readScopedPrefix("latest 00 session-bridge~title", "session-bridge")).toBeUndefined()
    expect(firstUnusedPrefix(["00 session-bridge~one", "02 session-bridge~three"], "session-bridge")).toBe(1)
  })
})

function currentRequest(): CurrentRequest {
  return {
    harness: "open-code",
    sessionID: "source",
    excludedMessageID: "request",
    invocationMessageID: "assistant",
    expectedCheckpointMessageCount: 0,
    confidence: "exact",
    evidence: "test",
  }
}
