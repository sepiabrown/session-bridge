import type { CurrentRequest } from "./session_bridge.ts"

export interface CurrentRequestMethod<Input = unknown> {
  harness: string
  resolve(input: Input): Promise<CurrentRequest>
}

export async function resolve<Input>(method: CurrentRequestMethod<Input>, input: Input) {
  const current = await method.resolve(input)
  if (!current.sessionID || !current.excludedMessageID || !current.invocationMessageID) {
    throw new Error(`Harness ${JSON.stringify(method.harness)} returned an incomplete current-request coordinate.`)
  }
  return current
}
