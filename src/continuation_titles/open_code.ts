import type { ContinuationTitleMethod } from "../continuation_titles.ts"
import type { CurrentRequest } from "../session_bridge.ts"
import { unwrap, type OpenCodeClient } from "../open_code_contract.ts"

const prefixPattern = /^(\d{2,})(?:\s|$)/

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

      const retained = readPrefix(currentSession.title)
      const prefix = retained ?? firstUnusedPrefix(sessions.map((session) => session.title))
      return `${formatPrefix(prefix)} ${input.checkpointTitle}`
    },
  }
}

export function readPrefix(title: string) {
  const match = prefixPattern.exec(title)
  if (!match) return undefined
  const prefix = Number(match[1])
  return Number.isSafeInteger(prefix) ? prefix : undefined
}

export function firstUnusedPrefix(titles: string[]) {
  const used = new Set(titles.map(readPrefix).filter((value): value is number => value !== undefined))
  let prefix = 0
  while (used.has(prefix)) prefix += 1
  return prefix
}

function formatPrefix(prefix: number) {
  return String(prefix).padStart(2, "0")
}
