import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { FileReplayLedger } from "../src/checkpoint_authorizations/replay_ledger.ts"
import { SignedReceiptService } from "../src/checkpoint_authorizations/receipts.ts"
import { issueReceipt } from "../src/checkpoint_authorizations.ts"
import { FileOperationJournal } from "../src/checkpoint_operations.ts"
import { createOpenCodeContinuationTitleMethod } from "../src/continuation_titles/open_code.ts"
import { resolve } from "../src/current_requests.ts"
import { openCodeCurrentRequest } from "../src/current_requests/open_code.ts"
import { checkpointSession } from "../src/session_bridge.ts"
import { createOpenCodeCheckpointMethod } from "../src/session_checkpoints/open_code.ts"
import { checkpointConversation, OpenCodeHarness } from "./open_code_harness.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Session Bridge", () => {
  test("forks before the request and renames both sessions", async () => {
    const setup = await createSetup()
    const result = await checkpointSession(request(setup.current), setup.runtime)

    expect(result).toMatchObject({
      status: "complete",
      sourceSessionID: "source",
      checkpointSessionID: "fork-1",
      excludedMessageID: "checkpoint-request",
    })
    expect(setup.client.sessions.get("source")?.title).toBe("00 260916___next")
    expect(setup.client.sessions.get("fork-1")?.title).toBe("260915___previous")
    expect(setup.client.sessions.get("fork-1")?.messages).toHaveLength(2)
  })

  test("returns the completed result for an exact retry", async () => {
    const setup = await createSetup()
    const first = await checkpointSession(request(setup.current), setup.runtime)
    const second = await checkpointSession(request(setup.current), setup.runtime)

    expect(first.status).toBe("complete")
    expect(second).toEqual(first)
    expect([...setup.client.sessions.keys()].filter((id) => id.startsWith("fork-"))).toEqual(["fork-1"])
  })

  test("preserves the checkpoint and reports a partial live rename", async () => {
    const setup = await createSetup()
    setup.client.failContinuationRename = true
    const result = await checkpointSession(request(setup.current), setup.runtime)

    expect(result).toMatchObject({
      status: "partial",
      checkpointSessionID: "fork-1",
      failedStep: "continuation-renamed",
    })
    expect(setup.client.sessions.get("fork-1")?.title).toBe("260915___previous")
    expect(setup.client.sessions.get("source")?.title).toBe("00 old")
  })

  test("executes through a signed receipt without raw identity arguments", async () => {
    const setup = await createSetup()
    const receipt = await issueReceipt(setup.current, setup.runtime.authorizations)
    const result = await checkpointSession(
      {
        authorization: { type: "signed-receipt", receipt },
        names: request(setup.current).names,
      },
      setup.runtime,
    )

    expect(result.status).toBe("complete")
    expect(setup.client.sessions.get("fork-1")?.messages).toHaveLength(2)
  })
})

async function createSetup() {
  const directory = await temporaryDirectory()
  const client = new OpenCodeHarness()
  client.addSession({ id: "source", title: "00 old", messages: checkpointConversation() })
  const current = await resolve(openCodeCurrentRequest, {
    client,
    sessionID: "source",
    assistantMessageID: "checkpoint-response",
    directory: "C:/project",
    endpoint: "http://localhost:4096",
  })
  return {
    client,
    current,
    runtime: {
      authorizations: {
        receipts: await SignedReceiptService.create({ secretPath: join(directory, "secret") }),
        replay: new FileReplayLedger(join(directory, "replay.json")),
      },
      operations: new FileOperationJournal(join(directory, "operations")),
      continuationTitles: [createOpenCodeContinuationTitleMethod(client)],
      methods: [createOpenCodeCheckpointMethod(client)],
    },
  }
}

function request(current: Awaited<ReturnType<typeof resolve<typeof openCodeCurrentRequest>>>) {
  return {
    authorization: { type: "trusted-invocation" as const, current },
    names: {
      checkpointTitle: "260915___previous",
      continuationTitle: "00 260916___next",
    },
  }
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "session-bridge-"))
  directories.push(directory)
  return directory
}
