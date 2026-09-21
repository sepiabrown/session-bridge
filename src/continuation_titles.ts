import { blocked } from "./checkpoint_failures.ts"
import type { CurrentRequest } from "./session_bridge.ts"
import {
  completeNames,
  requireCheckpointTitle,
  type CheckpointNameRequest,
  type CheckpointNames,
} from "./session_bridge/checkpoint_names.ts"

export interface ContinuationTitleMethod {
  harness: string
  allocate(input: { current: CurrentRequest; checkpointTitle: string }): Promise<string>
}

export async function resolveContinuationTitle(
  input: CheckpointNameRequest,
  current: CurrentRequest,
  methods: ContinuationTitleMethod[],
): Promise<CheckpointNames> {
  const checkpointTitle = requireCheckpointTitle(input.checkpointTitle)
  if (input.continuationTitle !== undefined) {
    return completeNames(checkpointTitle, input.continuationTitle)
  }

  const method = methods.find((candidate) => candidate.harness === current.harness)
  if (!method) {
    throw blocked(
      "unsupported-title-allocation",
      `No continuation-title allocator owns harness ${JSON.stringify(current.harness)}.`,
    )
  }
  return completeNames(checkpointTitle, await method.allocate({ current, checkpointTitle }))
}
