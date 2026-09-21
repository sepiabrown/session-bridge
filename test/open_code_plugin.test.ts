import { afterEach, expect, test } from "bun:test"
import type { PluginInput, ToolContext } from "@opencode-ai/plugin"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SessionBridgePlugin } from "../src/open_code.ts"
import { checkpointConversation, OpenCodeHarness } from "./open_code_harness.ts"

const directories: string[] = []
const originalStateDirectory = process.env.SESSION_BRIDGE_STATE_DIR

afterEach(async () => {
  if (originalStateDirectory === undefined) delete process.env.SESSION_BRIDGE_STATE_DIR
  else process.env.SESSION_BRIDGE_STATE_DIR = originalStateDirectory
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("OpenCode plugin resolves authority and performs the checkpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "session-bridge-plugin-"))
  directories.push(directory)
  process.env.SESSION_BRIDGE_STATE_DIR = directory
  const client = new OpenCodeHarness()
  client.addSession({ id: "source", title: "00 old", messages: checkpointConversation() })
  const hooks = await SessionBridgePlugin({
    client,
    directory: "C:/project",
    worktree: "C:/project",
    serverUrl: new URL("http://localhost:4096"),
  } as unknown as PluginInput)
  const context = {
    sessionID: "source",
    messageID: "checkpoint-response",
    agent: "checkpoint-agent",
    directory: "C:/project",
    worktree: "C:/project",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  } satisfies ToolContext

  const receiptOutput = await hooks.tool!.session_checkpoint_receipt!.execute({}, context)
  expect(typeof receiptOutput).toBe("string")
  expect(JSON.parse(typeof receiptOutput === "string" ? receiptOutput : receiptOutput.output).receipt).toStartWith("sbr1.")

  const checkpointOutput = await hooks.tool!.session_checkpoint!.execute(
    {
      workingFolders: ["session-bridge___unstable___00"],
      checkpointTitle: "260915___previous",
    },
    context,
  )
  expect(checkpointOutput).toBe(
    "Checkpoint created: session-bridge~260915___previous\nContinuation: 00 session-bridge~260915___previous",
  )
  expect(checkpointOutput).not.toContain("operationID")
  expect(checkpointOutput).not.toContain("sessionID")
  expect(client.sessions.get("fork-1")?.messages).toHaveLength(2)
  expect(client.sessions.get("source")?.title).toBe("00 session-bridge~260915___previous")
})
