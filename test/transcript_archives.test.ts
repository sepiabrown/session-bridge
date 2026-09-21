import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { archiveTranscript } from "../src/transcript_archives.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("transcript archival states that the host session was not changed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "session-bridge-archive-"))
  directories.push(directory)
  const result = await archiveTranscript({
    harness: "unsupported-harness",
    sessionID: "session-1",
    title: "Active / conversation",
    messages: [{ role: "user", text: "hello" }],
    destinationDirectory: directory,
    createdAt: Date.UTC(2026, 8, 16, 1, 2, 3),
  })

  expect(result.hostSessionChanged).toBe(false)
  expect(result.warning).toContain("not forked or renamed")
  const saved = JSON.parse(await readFile(result.artifact, "utf8"))
  expect(saved.format).toBe("session-bridge-transcript-v1")
  expect(saved.messages).toHaveLength(1)
})
