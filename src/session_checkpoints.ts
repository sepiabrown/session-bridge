import type { CheckpointOperation } from "./checkpoint_operations.ts"
import type { CurrentRequest } from "./session_bridge.ts"
import type { CheckpointNames } from "./session_bridge/checkpoint_names.ts"

export type CheckpointEffect = {
  checkpointSessionID: string
}

export interface SessionCheckpointMethod {
  harness: string
  create(input: {
    current: CurrentRequest
    names: CheckpointNames
    operation: CheckpointOperation
  }): Promise<CheckpointEffect>
}

export function select(harness: string, methods: SessionCheckpointMethod[]) {
  return methods.find((method) => method.harness === harness)
}
