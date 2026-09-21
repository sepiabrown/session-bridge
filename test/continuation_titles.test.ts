import { describe, expect, test } from "bun:test"
import { resolveContinuationTitle } from "../src/continuation_titles.ts"
import {
  createOpenCodeContinuationTitleMethod,
  firstUnusedPrefix,
  readPrefix,
} from "../src/continuation_titles/open_code.ts"
import type { CurrentRequest } from "../src/session_bridge.ts"
import { OpenCodeHarness } from "./open_code_harness.ts"

describe("continuation titles", () => {
  test("retains the current numeric prefix", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "03 previous", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "260917___abc1234___summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("03 260917___abc1234___summary")
  })

  test("allocates the smallest unused numeric prefix", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "ordinary session", messages: [] })
    client.addSession({ id: "slot-0", title: "00 first", messages: [] })
    client.addSession({ id: "slot-2", title: "02 third", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "260917___abc1234___summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("01 260917___abc1234___summary")
  })

  test("migrates a legacy latest title to the first numeric prefix", async () => {
    const client = new OpenCodeHarness()
    client.addSession({ id: "source", title: "latest 00 previous", messages: [] })

    const names = await resolveContinuationTitle(
      { checkpointTitle: "260917___abc1234___summary" },
      currentRequest(),
      [createOpenCodeContinuationTitleMethod(client)],
    )

    expect(names.continuationTitle).toBe("00 260917___abc1234___summary")
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
    expect(readPrefix("00 title")).toBe(0)
    expect(readPrefix("100 title")).toBe(100)
    expect(readPrefix("latest 00 title")).toBeUndefined()
    expect(readPrefix("260917___checkpoint")).toBeUndefined()
    expect(firstUnusedPrefix(["00 one", "02 three"])).toBe(1)
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
