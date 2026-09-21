import { blocked } from "./checkpoint_failures.ts"
import type { CurrentRequest } from "./session_bridge.ts"
import type { ReceiptService } from "./checkpoint_authorizations/receipts.ts"
import type { ReplayLedger } from "./checkpoint_authorizations/replay_ledger.ts"

const authorizationBrand = Symbol("checkpoint-authorization")

export type TrustedAuthorizationInput = {
  type: "trusted-invocation"
  current: CurrentRequest
}

export type ReceiptAuthorizationInput = {
  type: "signed-receipt"
  receipt: string
}

export type AuthorizationInput = TrustedAuthorizationInput | ReceiptAuthorizationInput

export type CheckpointAuthorization = {
  readonly current: CurrentRequest
  readonly nonce: string
  readonly [authorizationBrand]: true
}

export type AuthorizationServices = {
  receipts: ReceiptService
  replay: ReplayLedger
}

export async function authorize(
  input: AuthorizationInput,
  services: AuthorizationServices,
): Promise<CheckpointAuthorization> {
  if (input.type === "trusted-invocation") {
    requireExecutableConfidence(input.current)
    return createAuthorization(input.current, crypto.randomUUID())
  }

  const receipt = await services.receipts.verify(input.receipt)
  requireExecutableConfidence(receipt.current)
  await services.replay.consume(receipt.nonce, receipt.expiresAt)
  return createAuthorization(receipt.current, receipt.nonce)
}

export async function issueReceipt(current: CurrentRequest, services: AuthorizationServices) {
  requireExecutableConfidence(current)
  return services.receipts.issue(current)
}

function requireExecutableConfidence(current: CurrentRequest) {
  if (current.confidence === "exact" || current.confidence === "verified") return
  throw blocked(
    "insufficient-confidence",
    `Checkpoint mutation requires exact or verified authority; received ${current.confidence}.`,
  )
}

function createAuthorization(current: CurrentRequest, nonce: string): CheckpointAuthorization {
  return { current, nonce, [authorizationBrand]: true }
}
