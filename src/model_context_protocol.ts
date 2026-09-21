#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { createPortableRuntime } from "./checkpoint_runtime.ts"
import { checkpointSession } from "./session_bridge.ts"

export async function createSessionBridgeMcpServer() {
  const server = new McpServer({ name: "session-bridge", version: "0.1.0" })
  const runtime = await createPortableRuntime()

  server.registerTool(
    "session_checkpoint",
    {
      title: "Create session checkpoint",
      description:
        "Redeem a trusted one-time receipt to checkpoint a conversation before its current request and retitle the continuation.",
      inputSchema: z.object({
        receipt: z.string().min(1),
        checkpointTitle: z.string().min(1).max(200),
        continuationTitle: z.string().min(1).max(200).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      const result = await checkpointSession(
        {
          authorization: { type: "signed-receipt", receipt: input.receipt },
          names: {
            checkpointTitle: input.checkpointTitle,
            ...(input.continuationTitle ? { continuationTitle: input.continuationTitle } : {}),
          },
        },
        runtime,
      )
      return {
        isError: result.status !== "complete",
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )

  return server
}

export async function runSessionBridgeMcpServer() {
  const server = await createSessionBridgeMcpServer()
  await server.connect(new StdioServerTransport())
}

if (import.meta.main) {
  await runSessionBridgeMcpServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
