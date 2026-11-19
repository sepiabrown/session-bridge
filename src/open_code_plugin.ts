import type { Plugin } from "@opencode/plugin"
import type { Plugin as LegacyPlugin } from "@opencode-ai/plugin"

// Each host loads only its own adapter; V1 and V2 have different plugin and session APIs.
export const SessionBridgePlugin = {
  id: "session-bridge",
  async setup(context: Plugin.Context) {
    const { setupOpenCodeV2 } = await import("./open_code_v2.ts")
    return setupOpenCodeV2(context)
  },
  async server(input: Parameters<LegacyPlugin>[0]) {
    const { SessionBridgePlugin } = await import("./open_code.ts")
    return SessionBridgePlugin(input)
  },
}

export default SessionBridgePlugin
