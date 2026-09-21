export type BlockedCheckpoint = {
  status: "blocked"
  reason:
    | "unsupported-harness"
    | "insufficient-confidence"
    | "expired-authorization"
    | "invalid-authorization"
    | "replayed-authorization"
    | "operation-conflict"
    | "effect-uncertain"
    | "unsupported-title-allocation"
  error: string
}

export function blocked(reason: BlockedCheckpoint["reason"], error: string): BlockedCheckpoint {
  return { status: "blocked", reason, error }
}

export function isBlockedCheckpoint(value: unknown): value is BlockedCheckpoint {
  if (!value || typeof value !== "object") return false
  return "status" in value && value.status === "blocked"
}
