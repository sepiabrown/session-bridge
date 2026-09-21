import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type TranscriptArchiveInput = {
  harness: string
  sessionID: string
  title: string
  messages: unknown[]
  destinationDirectory: string
  createdAt?: number
}

export type TranscriptArchiveResult = {
  status: "archived"
  artifact: string
  sha256: string
  hostSessionChanged: false
  warning: string
}

export async function archiveTranscript(input: TranscriptArchiveInput): Promise<TranscriptArchiveResult> {
  const createdAt = input.createdAt ?? Date.now()
  const document = {
    format: "session-bridge-transcript-v1",
    createdAt,
    harness: input.harness,
    sessionID: input.sessionID,
    title: input.title,
    messages: input.messages,
  }
  const bytes = `${JSON.stringify(document, null, 2)}\n`
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const filename = `${timestamp(createdAt)}___${safeName(input.title)}___${sha256.slice(0, 12)}.json`
  const artifact = join(input.destinationDirectory, filename)
  await mkdir(input.destinationDirectory, { recursive: true })
  await writeFile(artifact, bytes, { encoding: "utf8", flag: "wx" })
  return {
    status: "archived",
    artifact,
    sha256,
    hostSessionChanged: false,
    warning: "A transcript artifact was created; the host conversation was not forked or renamed.",
  }
}

function timestamp(value: number) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
}

function safeName(value: string) {
  const name = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return name || "session"
}
