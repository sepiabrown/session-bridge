import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

export function stateDirectory() {
  return process.env.SESSION_BRIDGE_STATE_DIR ?? join(homedir(), ".session-bridge")
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporary, path)
}

export async function withLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true })
  const handle = await acquire(path)
  try {
    return await action()
  } finally {
    await handle.close()
    await rm(path, { force: true })
  }
}

async function acquire(path: string) {
  const deadline = Date.now() + 5_000
  while (true) {
    try {
      return await open(path, "wx", 0o600)
    } catch (error) {
      if (!isAlreadyExists(error) || Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST"
}
