import type { ContinuationTitleMethod } from "../continuation_titles.ts"
import type { CurrentRequest } from "../session_bridge.ts"
import { unwrap, type OpenCodeClient } from "../open_code_contract.ts"

const scopedPrefixPattern = /^(\d{2,})\s+([^~]+)~/
const forkSuffixPattern = / \(fork #\d+\)$/

export function createOpenCodeContinuationTitleMethod(
  source: OpenCodeClient | ((current: CurrentRequest) => OpenCodeClient),
): ContinuationTitleMethod {
  return {
    harness: "open-code",
    async allocate(input) {
      const client = typeof source === "function" ? source(input.current) : source
      const directory = input.current.directory
      const query = directory ? { directory } : undefined
      const [currentSession, sessions] = await Promise.all([
        unwrap(
          client.session.get({ path: { id: input.current.sessionID }, ...(query ? { query } : {}) }),
          "read the active OpenCode session title",
        ),
        unwrap(
          client.session.list({ query: { ...(query ?? {}), limit: 10_000 } }),
          "list OpenCode session titles",
        ),
      ])

      const scope = readCheckpointScope(input.checkpointTitle)
      const retained = readScopedPrefix(currentSession.title, scope)
      const titles = sessions.map((session) => session.title)
      const prefix =
        retained === undefined
          ? firstUnusedPrefix(titles, scope)
          : hasForkSuffix(currentSession.title)
            ? firstUnusedPrefix(titles, scope, retained + 1)
            : retained
      return `${formatPrefix(prefix)} ${input.checkpointTitle}`
    },
  }
}

export function readCheckpointScope(checkpointTitle: string) {
  const delimiterIndex = checkpointTitle.indexOf("~")
  if (delimiterIndex <= 0) throw new Error("Scoped checkpoint title must begin with `<scope>~`.")
  return checkpointTitle.slice(0, delimiterIndex)
}

export function readScopedPrefix(title: string, scope: string) {
  const match = scopedPrefixPattern.exec(title)
  if (!match) return undefined
  if (match[2] !== scope) return undefined
  const prefix = Number(match[1])
  return Number.isSafeInteger(prefix) ? prefix : undefined
}

export function hasForkSuffix(title: string) {
  return forkSuffixPattern.test(title)
}

export function firstUnusedPrefix(titles: string[], scope: string, start = 0) {
  const used = new Set(
    titles.map((title) => readScopedPrefix(title, scope)).filter((value): value is number => value !== undefined),
  )
  let prefix = start
  while (used.has(prefix)) prefix += 1
  return prefix
}

function formatPrefix(prefix: number) {
  return String(prefix).padStart(2, "0")
}
