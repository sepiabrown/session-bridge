import { createOpencodeClient } from "@opencode-ai/sdk"
import { FileReplayLedger } from "./checkpoint_authorizations/replay_ledger.ts"
import { SignedReceiptService } from "./checkpoint_authorizations/receipts.ts"
import { FileOperationJournal } from "./checkpoint_operations.ts"
import type { OpenCodeClient } from "./open_code_contract.ts"
import type { SessionBridgeRuntime } from "./session_bridge.ts"
import { createOpenCodeCheckpointMethod } from "./session_checkpoints/open_code.ts"

export async function createPortableRuntime(): Promise<SessionBridgeRuntime> {
  const receipts = await SignedReceiptService.create()
  return {
    authorizations: { receipts, replay: new FileReplayLedger() },
    operations: new FileOperationJournal(),
    methods: [
      createOpenCodeCheckpointMethod((current) => {
        if (!current.endpoint) throw new Error("The authorized OpenCode coordinate has no API endpoint.")
        return createOpencodeClient({
          baseUrl: current.endpoint,
          ...(current.directory ? { directory: current.directory } : {}),
        }) as unknown as OpenCodeClient
      }),
    ],
  }
}
