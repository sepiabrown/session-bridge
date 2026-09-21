import { describe, expect, test } from "bun:test"
import { normalizeFolderScope, resolveWorkingScope, scopeCheckpointTitle } from "../src/working_scopes.ts"

describe("working scopes", () => {
  test("removes the default worktree suffix from folder paths", () => {
    expect(normalizeFolderScope("C:\\work\\session-bridge___unstable___00")).toBe("session-bridge")
    expect(normalizeFolderScope("/work/codosa___unstable___00/")).toBe("codosa")
  })

  test("supports a custom suffix delimiter", () => {
    expect(normalizeFolderScope("session-bridge--unstable--00", "--")).toBe("session-bridge")
  })

  test("normalizes, deduplicates, and joins multiple folders", () => {
    expect(
      resolveWorkingScope({
        workingFolders: ["codosa___unstable___00", "session-bridge___unstable___00", "codosa___other___01"],
      }),
    ).toBe("codosa+session-bridge")
  })

  test("keeps the whole basename when no suffix delimiter exists", () => {
    expect(normalizeFolderScope("My_Project")).toBe("my-project")
    expect(scopeCheckpointTitle("my-project", "260921~abc1234~summary")).toBe(
      "my-project~260921~abc1234~summary",
    )
  })

  test("rejects unsafe suffix delimiters and empty semantic names", () => {
    expect(() => normalizeFolderScope("project___work", "/")).toThrow("path separators")
    expect(() => normalizeFolderScope("___unstable___00")).toThrow("no semantic name")
  })
})
