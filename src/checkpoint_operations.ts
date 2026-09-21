import { createHash } from "node:crypto"
import { join } from "node:path"
import type { CheckpointAuthorization } from "./checkpoint_authorizations.ts"
import {
  blocked,
  type BlockedCheckpoint,
  type CheckpointResult,
  type CheckpointStep,
  type CompleteCheckpoint,
  type PartialCheckpoint,
} from "./session_bridge.ts"
import type { CheckpointNames } from "./session_bridge/checkpoint_names.ts"
import { readJson, stateDirectory, withLock, writeJson } from "./session_bridge_state.ts"
import type { CheckpointEffect } from "./session_checkpoints.ts"

type StoredOperation = {
  operationID: string
  fingerprint: string
  status: "prepared" | "running" | "complete" | "partial" | "blocked"
  createdAt: number
  updatedAt: number
  steps: CheckpointStep[]
  checkpointSessionID?: string
  result?: CheckpointResult
}

export interface OperationJournal {
  begin(input: OperationIdentity): Promise<StoredOperation | undefined>
  read(operationID: string): Promise<StoredOperation | undefined>
  write(record: StoredOperation): Promise<void>
}

export class FileOperationJournal implements OperationJournal {
  constructor(private readonly directory = join(stateDirectory(), "operations")) {}

  async begin(input: OperationIdentity) {
    const path = this.path(input.operationID)
    return withLock(`${path}.lock`, async () => {
      const prior = await readJson<StoredOperation>(path)
      if (prior) return prior
      const now = Date.now()
      const record: StoredOperation = {
        operationID: input.operationID,
        fingerprint: input.fingerprint,
        status: "prepared",
        createdAt: now,
        updatedAt: now,
        steps: ["prepared"],
      }
      await writeJson(path, record)
      return undefined
    })
  }

  read(operationID: string) {
    return readJson<StoredOperation>(this.path(operationID))
  }

  async write(record: StoredOperation) {
    const path = this.path(record.operationID)
    await withLock(`${path}.lock`, () => writeJson(path, record))
  }

  private path(operationID: string) {
    return join(this.directory, `${operationID}.json`)
  }
}

export type OperationIdentity = {
  operationID: string
  fingerprint: string
}

export type CheckpointOperation = {
  type: "active"
  operationID: string
  record(step: CheckpointStep, detail?: { checkpointSessionID?: string }): Promise<void>
  complete(effect: CheckpointEffect): Promise<CompleteCheckpoint>
  fail(error: string): Promise<PartialCheckpoint>
  block(reason: BlockedCheckpoint["reason"], error: string): Promise<BlockedCheckpoint>
}

export type BegunOperation = CheckpointOperation | { type: "completed"; result: CompleteCheckpoint }

export async function begin(
  input: { authorization: CheckpointAuthorization; names: CheckpointNames },
  journal: OperationJournal,
): Promise<BegunOperation> {
  const identity = identify(input)
  const prior = await journal.begin(identity)
  if (prior?.fingerprint !== undefined && prior.fingerprint !== identity.fingerprint) {
    throw blocked("operation-conflict", "The checkpoint operation identifier conflicts with different input.")
  }
  if (prior?.status === "complete" && prior.result?.status === "complete") {
    return { type: "completed", result: prior.result }
  }
  if (prior) {
    throw blocked(
      "effect-uncertain",
      `Checkpoint operation ${identity.operationID} already reached ${prior.status}; inspect its journal before retrying.`,
    )
  }

  return activeOperation(identity.operationID, input, journal)
}

function activeOperation(
  operationID: string,
  input: { authorization: CheckpointAuthorization; names: CheckpointNames },
  journal: OperationJournal,
): CheckpointOperation {
  return {
    type: "active",
    operationID,
    async record(step, detail) {
      const record = await requireRecord(journal, operationID)
      if (!record.steps.includes(step)) record.steps.push(step)
      record.status = "running"
      record.updatedAt = Date.now()
      if (detail?.checkpointSessionID) record.checkpointSessionID = detail.checkpointSessionID
      await journal.write(record)
    },
    async complete(effect) {
      const result: CompleteCheckpoint = {
        status: "complete",
        operationID,
        sourceSessionID: input.authorization.current.sessionID,
        checkpointSessionID: effect.checkpointSessionID,
        checkpointTitle: input.names.checkpointTitle,
        continuationTitle: input.names.continuationTitle,
        excludedMessageID: input.authorization.current.excludedMessageID,
      }
      const record = await requireRecord(journal, operationID)
      record.status = "complete"
      record.updatedAt = Date.now()
      record.result = result
      await journal.write(record)
      return result
    },
    async fail(error) {
      const record = await requireRecord(journal, operationID)
      const result: PartialCheckpoint = {
        status: "partial",
        operationID,
        completedSteps: record.steps,
        ...(record.checkpointSessionID ? { checkpointSessionID: record.checkpointSessionID } : {}),
        failedStep: nextStep(record.steps),
        error,
        recovery: `Inspect operation ${operationID}; no automatic rollback or retry was performed.`,
      }
      record.status = "partial"
      record.updatedAt = Date.now()
      record.result = result
      await journal.write(record)
      return result
    },
    async block(reason, error) {
      const result = blocked(reason, error)
      const record = await requireRecord(journal, operationID)
      record.status = "blocked"
      record.updatedAt = Date.now()
      record.result = result
      await journal.write(record)
      return result
    },
  }
}

function identify(input: { authorization: CheckpointAuthorization; names: CheckpointNames }): OperationIdentity {
  const payload = JSON.stringify({
    harness: input.authorization.current.harness,
    endpoint: input.authorization.current.endpoint,
    directory: input.authorization.current.directory,
    sessionID: input.authorization.current.sessionID,
    excludedMessageID: input.authorization.current.excludedMessageID,
    expectedCheckpointMessageCount: input.authorization.current.expectedCheckpointMessageCount,
    checkpointTitle: input.names.checkpointTitle,
    continuationTitle: input.names.continuationTitle,
  })
  const fingerprint = createHash("sha256").update(payload).digest("hex")
  return { operationID: fingerprint.slice(0, 24), fingerprint }
}

async function requireRecord(journal: OperationJournal, operationID: string) {
  const record = await journal.read(operationID)
  if (!record) throw new Error(`Checkpoint operation ${operationID} disappeared from its journal.`)
  return record
}

function nextStep(steps: CheckpointStep[]): CheckpointStep {
  const order: CheckpointStep[] = [
    "prepared",
    "checkpoint-created",
    "checkpoint-renamed",
    "continuation-renamed",
    "verified",
  ]
  return order.find((step) => !steps.includes(step)) ?? "verified"
}
