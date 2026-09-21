import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import { blocked, type CurrentRequest } from "../session_bridge.ts"
import { stateDirectory } from "../session_bridge_state.ts"

const currentRequestSchema = z.object({
  harness: z.string().min(1),
  sessionID: z.string().min(1),
  excludedMessageID: z.string().min(1),
  invocationMessageID: z.string().min(1),
  expectedCheckpointMessageCount: z.number().int().nonnegative(),
  directory: z.string().optional(),
  endpoint: z.string().url().optional(),
  confidence: z.enum(["exact", "verified", "derived", "heuristic", "ambiguous"]),
  evidence: z.string().min(1),
})

const payloadSchema = z.object({
  version: z.literal(1),
  issuer: z.literal("session-bridge"),
  action: z.literal("checkpoint-session"),
  nonce: z.string().uuid(),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  current: currentRequestSchema,
})

export type ReceiptPayload = z.infer<typeof payloadSchema>

export interface ReceiptService {
  issue(current: CurrentRequest): Promise<string>
  verify(receipt: string): Promise<ReceiptPayload>
}

export class SignedReceiptService implements ReceiptService {
  private constructor(
    private readonly secret: Uint8Array,
    private readonly lifetimeMilliseconds: number,
  ) {}

  static async create(input?: { secretPath?: string; lifetimeMilliseconds?: number }) {
    const secret = await loadSecret(input?.secretPath ?? join(stateDirectory(), "receipt.key"))
    return new SignedReceiptService(secret, input?.lifetimeMilliseconds ?? 5 * 60 * 1_000)
  }

  async issue(current: CurrentRequest) {
    const issuedAt = Date.now()
    const payload: ReceiptPayload = {
      version: 1,
      issuer: "session-bridge",
      action: "checkpoint-session",
      nonce: crypto.randomUUID(),
      issuedAt,
      expiresAt: issuedAt + this.lifetimeMilliseconds,
      current,
    }
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
    return `sbr1.${encoded}.${sign(encoded, this.secret)}`
  }

  async verify(receipt: string) {
    const [version, encoded, suppliedSignature, extra] = receipt.split(".")
    if (version !== "sbr1" || !encoded || !suppliedSignature || extra) {
      throw blocked("invalid-authorization", "The checkpoint receipt has an invalid envelope.")
    }

    const expectedSignature = sign(encoded, this.secret)
    const supplied = Buffer.from(suppliedSignature, "base64url")
    const expected = Buffer.from(expectedSignature, "base64url")
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw blocked("invalid-authorization", "The checkpoint receipt signature is invalid.")
    }

    const decoded = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
    if (!decoded.success) throw blocked("invalid-authorization", "The checkpoint receipt payload is invalid.")
    if (decoded.data.expiresAt <= Date.now()) {
      throw blocked("expired-authorization", "The checkpoint receipt has expired.")
    }
    return decoded.data
  }
}

function sign(encoded: string, secret: Uint8Array) {
  return createHmac("sha256", secret).update(encoded).digest("base64url")
}

async function loadSecret(path: string) {
  if (process.env.SESSION_BRIDGE_SECRET) return Buffer.from(process.env.SESSION_BRIDGE_SECRET, "base64url")
  try {
    return Buffer.from((await readFile(path, "utf8")).trim(), "base64url")
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    const secret = randomBytes(32)
    await mkdir(dirname(path), { recursive: true })
    try {
      await writeFile(path, secret.toString("base64url"), { encoding: "utf8", flag: "wx", mode: 0o600 })
      return secret
    } catch (writeError) {
      if (!(writeError instanceof Error && "code" in writeError && writeError.code === "EEXIST")) throw writeError
      return Buffer.from((await readFile(path, "utf8")).trim(), "base64url")
    }
  }
}
