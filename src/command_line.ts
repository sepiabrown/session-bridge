#!/usr/bin/env bun

import { checkpointSession } from "./session_bridge.ts"
import { createPortableRuntime } from "./checkpoint_runtime.ts"

export async function runCommandLine(arguments_: string[]) {
  const [command, ...argumentsList] = arguments_
  if (command === "checkpoint") {
    const input = parseCheckpointArguments(argumentsList)
    const result = await checkpointSession(
      {
        authorization: { type: "signed-receipt", receipt: input.receipt },
        workingFolders: input.workingFolders,
        ...(input.worktreeSuffixDelimiter
          ? { worktreeSuffixDelimiter: input.worktreeSuffixDelimiter }
          : {}),
        names: {
          checkpointTitle: input.checkpointTitle,
          ...(input.continuationTitle ? { continuationTitle: input.continuationTitle } : {}),
        },
      },
      await createPortableRuntime(),
    )
    console.log(JSON.stringify(result, null, 2))
    return result.status === "complete" ? 0 : 1
  }

  if (command === "probe") {
    console.log(
      JSON.stringify(
        {
          status: "blocked",
          reason: "no-authoritative-harness-context",
          error:
            "Generic CLI discovery cannot prove the current request. Use a harness integration to issue an exact receipt.",
        },
        null,
        2,
      ),
    )
    return 1
  }

  console.error(usage())
  return 2
}

function parseCheckpointArguments(arguments_: string[]) {
  const values = new Map<string, string>()
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index]
    const value = arguments_[index + 1]
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid checkpoint argument near ${key ?? "end"}.`)
    values.set(key.slice(2), value)
  }
  return {
    receipt: requireArgument(values, "receipt"),
    workingFolders: requireArgument(values, "working-folders")
      .split(",")
      .map((folder) => folder.trim())
      .filter(Boolean),
    worktreeSuffixDelimiter: values.get("worktree-suffix-delimiter"),
    checkpointTitle: requireArgument(values, "checkpoint-title"),
    continuationTitle: values.get("continuation-title"),
  }
}

function requireArgument(values: Map<string, string>, name: string) {
  const value = values.get(name)
  if (!value) throw new Error(`Missing required --${name} argument.`)
  return value
}

function usage() {
  return [
    "Usage:",
    "  session-bridge checkpoint --receipt <receipt> --working-folders <folder[,folder]> --checkpoint-title <title> [--worktree-suffix-delimiter <delimiter>] [--continuation-title <title>]",
    "  session-bridge probe",
  ].join("\n")
}

if (import.meta.main) {
  process.exitCode = await runCommandLine(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  })
}
