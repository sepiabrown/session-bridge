#!/usr/bin/env bun

import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export type OpenCodeSetupInput = {
  targetDirectory: string
  repositoryRoot?: string
  force?: boolean
  verifyImport?: boolean
}

export type OpenCodeSetupResult = {
  status: "installed" | "unchanged"
  targetDirectory: string
  repositoryRoot: string
  pluginFile: string
  importPath: string
}

export async function setupOpenCodePlugin(input: OpenCodeSetupInput): Promise<OpenCodeSetupResult> {
  const targetDirectory = resolve(input.targetDirectory)
  const repositoryRoot = resolve(input.repositoryRoot ?? fileURLToPath(new URL("..", import.meta.url)))
  await requireDirectory(targetDirectory, "Target project")
  await requireDirectory(repositoryRoot, "Session Bridge repository")

  const pluginSource = resolve(repositoryRoot, "src", "open_code.ts")
  await requireFile(pluginSource, "Session Bridge OpenCode plugin")
  const pluginDirectory = resolve(targetDirectory, ".opencode", "plugins")
  const pluginFile = resolve(pluginDirectory, "session-bridge.ts")
  const relativeImport = relative(pluginDirectory, pluginSource)
  const importPath = isAbsolute(relativeImport) ? pathToFileURL(pluginSource).href : modulePath(relativeImport)
  const content = `export { SessionBridgePlugin } from ${JSON.stringify(importPath)}\n`

  await mkdir(pluginDirectory, { recursive: true })
  const existing = await optionalText(pluginFile)
  if (existing !== undefined && existing !== content && !input.force) {
    throw new Error(
      `${pluginFile} already exists with different content. Re-run with --force only after reviewing that file.`,
    )
  }

  if (input.verifyImport !== false) {
    const loaded = await import(`${pathToFileURL(pluginSource).href}?setup=${Date.now()}`)
    if (typeof loaded.SessionBridgePlugin !== "function") {
      throw new Error(`${pluginSource} did not export SessionBridgePlugin.`)
    }
  }

  const status = existing === content ? "unchanged" : "installed"
  if (status === "installed") await writeFile(pluginFile, content, "utf8")

  return { status, targetDirectory, repositoryRoot, pluginFile, importPath }
}

function modulePath(path: string) {
  const normalized = path.replaceAll("\\", "/")
  return normalized.startsWith(".") ? normalized : `./${normalized}`
}

async function requireDirectory(path: string, label: string) {
  try {
    if ((await stat(path)).isDirectory()) return
  } catch {}
  throw new Error(`${label} does not exist or is not a directory: ${path}`)
}

async function requireFile(path: string, label: string) {
  try {
    if ((await stat(path)).isFile()) return
  } catch {}
  throw new Error(`${label} does not exist: ${path}`)
}

async function optionalText(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

function parseArguments(arguments_: string[]) {
  const force = arguments_.includes("--force")
  const positional = arguments_.filter((argument) => argument !== "--force")
  if (positional.length !== 1) {
    throw new Error("Usage: bun run setup:open-code -- <target-project-directory> [--force]")
  }
  return { targetDirectory: positional[0]!, force }
}

if (import.meta.main) {
  const result = await setupOpenCodePlugin(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return undefined
  })
  if (result) console.log(JSON.stringify(result, null, 2))
}
