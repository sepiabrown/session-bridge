import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { authorize, issueReceipt } from "../src/checkpoint_authorizations.ts"
import { FileReplayLedger } from "../src/checkpoint_authorizations/replay_ledger.ts"
import { SignedReceiptService } from "../src/checkpoint_authorizations/receipts.ts"
import type { CurrentRequest } from "../src/session_bridge.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("checkpoint authorizations", () => {
  test("issues, verifies, and consumes a receipt once", async () => {
    const directory = await temporaryDirectory()
    const services = {
      receipts: await SignedReceiptService.create({ secretPath: join(directory, "secret") }),
      replay: new FileReplayLedger(join(directory, "replay.json")),
    }
    const receipt = await issueReceipt(exactCurrentRequest(), services)

    const authorization = await authorize({ type: "signed-receipt", receipt }, services)
    expect(authorization.current.excludedMessageID).toBe("request")
    await expect(authorize({ type: "signed-receipt", receipt }, services)).rejects.toMatchObject({
      status: "blocked",
      reason: "replayed-authorization",
    })
  })

  test("rejects non-executable discovery confidence", async () => {
    const directory = await temporaryDirectory()
    const services = {
      receipts: await SignedReceiptService.create({ secretPath: join(directory, "secret") }),
      replay: new FileReplayLedger(join(directory, "replay.json")),
    }

    await expect(
      authorize(
        { type: "trusted-invocation", current: { ...exactCurrentRequest(), confidence: "derived" } },
        services,
      ),
    ).rejects.toMatchObject({ status: "blocked", reason: "insufficient-confidence" })
  })

  test("rejects tampered and expired receipts", async () => {
    const directory = await temporaryDirectory()
    const services = {
      receipts: await SignedReceiptService.create({
        secretPath: join(directory, "secret"),
        lifetimeMilliseconds: -1,
      }),
      replay: new FileReplayLedger(join(directory, "replay.json")),
    }
    const expired = await issueReceipt(exactCurrentRequest(), services)
    await expect(authorize({ type: "signed-receipt", receipt: expired }, services)).rejects.toMatchObject({
      status: "blocked",
      reason: "expired-authorization",
    })

    const validServices = {
      receipts: await SignedReceiptService.create({ secretPath: join(directory, "secret") }),
      replay: services.replay,
    }
    const valid = await issueReceipt(exactCurrentRequest(), validServices)
    const [version, payload, signature] = valid.split(".") as [string, string, string]
    const tamperedSignature = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`
    const tampered = `${version}.${payload}.${tamperedSignature}`
    await expect(authorize({ type: "signed-receipt", receipt: tampered }, validServices)).rejects.toMatchObject({
      status: "blocked",
      reason: "invalid-authorization",
    })
  })
})

function exactCurrentRequest(): CurrentRequest {
  return {
    harness: "open-code",
    sessionID: "session",
    excludedMessageID: "request",
    invocationMessageID: "assistant",
    expectedCheckpointMessageCount: 2,
    confidence: "exact",
    evidence: "test",
  }
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "session-bridge-"))
  directories.push(directory)
  return directory
}
