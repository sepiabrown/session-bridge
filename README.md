# Session Bridge

Session Bridge creates a durable checkpoint immediately before the current
checkpoint request, then keeps the original conversation active under a new
title.

The OpenCode-compatible plugin receives authoritative session context directly.
CLI and MCP callers must present a short-lived, one-time authorization receipt;
raw session or message identifiers are not accepted as mutation authority.

## OpenCode compatibility

Install the default-exported definition in `src/open_code_plugin.ts`, then call
`session_checkpoint` with the repository `workingFolders`. Supply
`checkpointTitle` to use the existing scoped-title behavior, or omit it to
preserve the active session title exactly. V1 resolves the assistant message's
user parent; V2 captures the user-message ID from the actual model request and
verifies persisted message types. Both fork before that user request, so the
checkpoint request is not copied into the checkpoint.

Each working folder is reduced to its basename, cut at the first `___` by
default, and normalized to kebab-case. Scopes are deduplicated and joined with
`+`, then prepended to the checkpoint title with `~`. Override the cutoff marker
with `worktreeSuffixDelimiter` when a project uses another worktree convention.

```text
session-bridge___unstable___00 + 260921~abc1234~summary
-> session-bridge~260921~abc1234~summary
```

When `continuationTitle` is omitted, Session Bridge retains the source title's
leading numeric prefix (`00`, `01`, ...) only when its repository scope matches
the new checkpoint. Otherwise it allocates the smallest unused prefix within
that exact scope and produces `NN <checkpointTitle>`. Different repository
scopes therefore each begin at `00`. An explicit `continuationTitle` remains
available as an override.

When `checkpointTitle` is omitted, the checkpoint retains the active session
title byte-for-byte. An explicit `continuationTitle` is still used exactly. If
both titles are omitted, Session Bridge advances to the next unused numeric
prefix in the current repository scope and carries forward the scoped title
body for the continuation.

When the active title has the same scope and ends with `(fork #N)`, allocation
starts at its current numeric prefix plus one and advances past any occupied
slots. Non-fork sessions retain their current same-scope prefix.

Successful native plugin calls return only the checkpoint and continuation
titles. Full identifiers and operation progress remain in the durable operation
journal; blocked and partial results retain detailed diagnostic output.

OpenCode V2 (2.3.x plugin/client API) uses native tool transforms and permission
assertions. The dual-host entrypoint also supports V1 1.18.29+ through its lazy
`server` adapter; older V1 direct integrations may still import `src/open_code.ts`.
V1-compatible forks must preserve the OpenCode 1.2.20 server surface and
`@opencode-ai/plugin` string-returning tool contract.

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

The V1 adapter also exposes `session_checkpoint_receipt`. It returns a five-minute,
one-time receipt for a separate CLI or MCP process. The receipt binds the exact
harness, session, request boundary, API endpoint, expiry, and nonce.

V2 currently provides native `session_checkpoint` only. It lazily discovers the
matching managed background service without starting or replacing it. Explicit
or standalone servers must set plugin `options.server` with `url` and optional
`headers`; receipt transport through CLI/MCP is not yet supported for V2.

## CLI and MCP

The CLI accepts no raw session or message identifiers:

```text
session-bridge checkpoint --receipt <receipt> --working-folders <folder[,folder]> [--checkpoint-title <checkpoint-title>] [--worktree-suffix-delimiter <delimiter>] [--continuation-title <title>]
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

- working-scope normalization identifies the repositories represented by the title;
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
