# Session Bridge

Session Bridge creates a durable checkpoint immediately before the current
checkpoint request, then keeps the original conversation active under a new
title.

The OpenCode-compatible plugin receives authoritative session context directly.
CLI and MCP callers must present a short-lived, one-time authorization receipt;
raw session or message identifiers are not accepted as mutation authority.

## OpenCode compatibility

Add `src/open_code.ts` as an OpenCode-compatible plugin, then call
`session_checkpoint` with an explicit `checkpointTitle`. The plugin resolves the current assistant message's
user parent and forks before that parent, so the checkpoint request is
not copied into the checkpoint.

When `continuationTitle` is omitted, Session Bridge retains the source title's
leading numeric prefix (`00`, `01`, ...) or allocates the smallest unused prefix
and produces `NN <checkpointTitle>`. An explicit `continuationTitle` remains
available as an override.

The supported compatibility coordinates are current OpenCode 1.18.x and forks
that preserve the OpenCode 1.2.20 server surface with the string-returning
`@opencode-ai/plugin` 1.1.25 tool contract.

## Setup

For an existing checkout and target OpenCode project:

```text
bun install
bun run setup:open-code -- <target-directory>
```

The setup command creates `<target-directory>/.opencode/plugins/session-bridge.ts`
with a relative import back to this checkout. It is idempotent and refuses to
overwrite different existing content unless `--force` is explicitly supplied.

For LLM-assisted cloning and setup, give the LLM this repository reference and
the target project directory, then ask it to follow `INSTALL.md`. Setup supports
Windows, Linux, and macOS; Nix users can enter the included development shell
with `nix develop`.

The plugin also exposes `session_checkpoint_receipt`. It returns a five-minute,
one-time receipt for a separate CLI or MCP process. The receipt binds the exact
harness, session, request boundary, API endpoint, expiry, and nonce.

## CLI and MCP

The CLI accepts no raw session or message identifiers:

```text
session-bridge checkpoint --receipt <receipt> --checkpoint-title <checkpoint-title> [--continuation-title <continuation-title>]
```

Start the stdio MCP server with `session-bridge-mcp`. Its
`session_checkpoint` tool accepts the same receipt and optional title override.

Receipts and operation evidence are stored under `~/.session-bridge` by
default. Set `SESSION_BRIDGE_STATE_DIR` to choose another location. Set
`SESSION_BRIDGE_SECRET` to a base64url-encoded secret when independently
started processes cannot share the receipt key file.

If generic `session-bridge probe` cannot obtain authoritative harness context,
it returns a blocked result rather than guessing a session.

## Other harnesses

Harness support is added through three contracts:

- current-request resolution proves the exact conversation boundary;
- continuation-title allocation reads the host title namespace;
- session checkpointing performs and verifies the harness mutation.

A harness is not mutation-capable until both contracts are implemented and
verified. Transcript export remains a separate operation and is never reported
as a host checkpoint.

## Verification

```text
bun test
bun run typecheck
bun run build
```
