import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setupOpenCodePlugin } from "../src/setup_open_code.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("OpenCode plugin setup", () => {
  test("verifies and installs the repository's actual plugin export", async () => {
    const target = await temporaryDirectory()
    const result = await setupOpenCodePlugin({ targetDirectory: target })

    expect(result.status).toBe("installed")
    expect(await readFile(result.pluginFile, "utf8")).toContain("src/open_code.ts")
  })

  test("installs a relative plugin loader into a sibling target project", async () => {
    const parent = await temporaryDirectory()
    const repository = join(parent, "session-bridge")
    const target = join(parent, "test")
    await mkdir(join(repository, "src"), { recursive: true })
    await mkdir(target)
    await writeFile(join(repository, "src", "open_code.ts"), "export const SessionBridgePlugin = () => ({})\n")

    const first = await setupOpenCodePlugin({
      targetDirectory: target,
      repositoryRoot: repository,
      verifyImport: false,
    })
    const second = await setupOpenCodePlugin({
      targetDirectory: target,
      repositoryRoot: repository,
      verifyImport: false,
    })

    expect(first.status).toBe("installed")
    expect(second.status).toBe("unchanged")
    expect(first.importPath).toBe("../../../session-bridge/src/open_code.ts")
    expect(await readFile(first.pluginFile, "utf8")).toBe(
      'export { SessionBridgePlugin } from "../../../session-bridge/src/open_code.ts"\n',
    )
  })

  test("does not overwrite an existing plugin loader without force", async () => {
    const parent = await temporaryDirectory()
    const repository = join(parent, "session-bridge")
    const target = join(parent, "test")
    const pluginDirectory = join(target, ".opencode", "plugins")
    await mkdir(join(repository, "src"), { recursive: true })
    await mkdir(pluginDirectory, { recursive: true })
    await writeFile(join(repository, "src", "open_code.ts"), "export const SessionBridgePlugin = () => ({})\n")
    await writeFile(join(pluginDirectory, "session-bridge.ts"), "export const keep = true\n")

    await expect(
      setupOpenCodePlugin({
        targetDirectory: target,
        repositoryRoot: repository,
        verifyImport: false,
      }),
    ).rejects.toThrow("already exists with different content")
    expect(await readFile(join(pluginDirectory, "session-bridge.ts"), "utf8")).toBe("export const keep = true\n")
  })
})

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "session-bridge-setup-"))
  directories.push(directory)
  return directory
}
