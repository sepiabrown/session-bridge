import { join } from "node:path"
import { blocked } from "../session_bridge.ts"
import { readJson, stateDirectory, withLock, writeJson } from "../session_bridge_state.ts"

type ReplayState = Record<string, number>

export interface ReplayLedger {
  consume(nonce: string, expiresAt: number): Promise<void>
}

export class FileReplayLedger implements ReplayLedger {
  constructor(private readonly path = join(stateDirectory(), "consumed-receipts.json")) {}

  async consume(nonce: string, expiresAt: number) {
    await withLock(`${this.path}.lock`, async () => {
      const now = Date.now()
      const state = await readJson<ReplayState>(this.path)
      const active = Object.fromEntries(Object.entries(state ?? {}).filter((entry) => entry[1] > now))
      if (active[nonce]) throw blocked("replayed-authorization", "The checkpoint receipt was already consumed.")
      active[nonce] = expiresAt
      await writeJson(this.path, active)
    })
  }
}
