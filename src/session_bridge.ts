import { authorize, type AuthorizationInput, type AuthorizationServices } from "./checkpoint_authorizations.ts"
import { begin, type CheckpointOperation, type OperationJournal } from "./checkpoint_operations.ts"
import { blocked, isBlockedCheckpoint, type BlockedCheckpoint } from "./checkpoint_failures.ts"
import { resolveContinuationTitle, type ContinuationTitleMethod } from "./continuation_titles.ts"
import type { CheckpointNameRequest, CheckpointNames } from "./session_bridge/checkpoint_names.ts"
import { select, type SessionCheckpointMethod } from "./session_checkpoints.ts"
import { resolveWorkingScope, scopeCheckpointTitle, type WorkingScopeRequest } from "./working_scopes.ts"

export type Confidence = "exact" | "verified" | "derived" | "heuristic" | "ambiguous"

export type CurrentRequest = {
  harness: string
  sessionID: string
  excludedMessageID: string
  invocationMessageID: string
  expectedCheckpointMessageCount: number
  directory?: string | undefined
  endpoint?: string | undefined
  confidence: Confidence
  evidence: string
}

export type CheckpointStep =
  | "prepared"
  | "checkpoint-created"
  | "checkpoint-renamed"
  | "continuation-renamed"
  | "verified"

export type CompleteCheckpoint = {
  status: "complete"
  operationID: string
  sourceSessionID: string
  checkpointSessionID: string
  checkpointTitle: string
  continuationTitle: string
  excludedMessageID: string
}

export type PartialCheckpoint = {
  status: "partial"
  operationID: string
  completedSteps: CheckpointStep[]
  checkpointSessionID?: string
  failedStep: CheckpointStep
  error: string
  recovery: string
}

export type CheckpointResult = CompleteCheckpoint | PartialCheckpoint | BlockedCheckpoint
export { blocked, type BlockedCheckpoint } from "./checkpoint_failures.ts"

export type CheckpointInput = WorkingScopeRequest & {
  authorization: AuthorizationInput
  names: CheckpointNameRequest
}

export type SessionBridgeRuntime = {
  authorizations: AuthorizationServices
  operations: OperationJournal
  continuationTitles: ContinuationTitleMethod[]
  methods: SessionCheckpointMethod[]
}

export async function checkpointSession(
  input: CheckpointInput,
  runtime: SessionBridgeRuntime,
): Promise<CheckpointResult> {
  try {
    const authorization = await authorize(input.authorization, runtime.authorizations)
    const scope = resolveWorkingScope(input)
    const names = await resolveContinuationTitle(
      { ...input.names, checkpointTitle: scopeCheckpointTitle(scope, input.names.checkpointTitle) },
      authorization.current,
      runtime.continuationTitles,
    )
    const operation = await begin({ authorization, names }, runtime.operations)
    if (operation.type === "completed") return operation.result

    const method = select(authorization.current.harness, runtime.methods)
    if (!method) {
      return await operation.block(
        "unsupported-harness",
        `No checkpoint method owns harness ${JSON.stringify(authorization.current.harness)}.`,
      )
    }

    return await completeCheckpoint(method, operation, authorization.current, names)
  } catch (error) {
    if (isBlockedCheckpoint(error)) return error
    throw error
  }
}

async function completeCheckpoint(
  method: SessionCheckpointMethod,
  operation: CheckpointOperation,
  current: CurrentRequest,
  names: CheckpointNames,
): Promise<CheckpointResult> {
  try {
    const result = await method.create({ current, names, operation })
    return await operation.complete(result)
  } catch (error) {
    return operation.fail(error instanceof Error ? error.message : String(error))
  }
}
