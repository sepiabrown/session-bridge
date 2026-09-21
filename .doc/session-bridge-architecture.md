# Session Bridge Architecture

## Behavior

Session Bridge checkpoints a host conversation immediately before the current checkpoint request, gives that checkpoint an explicit title, and retitles the still-active source conversation. Changes require trusted session context. Unsupported hosts and uncertain request boundaries return explicit errors.

## Main workflow

```text
validate trusted session context
  -> normalize committed working-folder scope
  -> scope and validate checkpoint title
  -> retain or allocate continuation prefix
  -> begin or recover durable operation
  -> select host checkpoint implementation
  -> create, rename, verify, and settle
```

The public API entry point is `src/session_bridge.ts`. `src/working_scopes.ts` normalizes repository scope, `src/current_requests.ts` handles request-boundary discovery, `src/checkpoint_authorizations.ts` handles trusted invocations and signed receipts, `src/continuation_titles.ts` resolves the continuation namespace, `src/checkpoint_operations.ts` handles idempotency and partial-operation records, and `src/session_checkpoints.ts` defines the host integration interface.

## Working-folder scope

Checkpoint callers provide the repository folders represented by the work. `src/working_scopes.ts` takes each basename, removes it from the first worktree suffix delimiter (`___` by default), normalizes the semantic prefix to kebab-case, deduplicates scopes, and joins multiple scopes with `+`. A custom `worktreeSuffixDelimiter` supports other worktree naming conventions. The scope is prepended to the caller's checkpoint title with `~` before operation identity is computed.

## Continuation title allocation

`src/continuation_titles/open_code.ts` reads the active title and the project session-title catalogue. A leading numeric source prefix (`00`, `01`, ...) is retained. Otherwise the smallest unused non-negative prefix is selected and padded to at least two digits. The resulting title is `NN <checkpointTitle>`. Callers may still provide an explicit continuation title override.

## OpenCode request boundary

OpenCode tool context identifies the current assistant message. The excluded checkpoint request is the user message named by that assistant message's persisted `parentID`. `src/current_requests/open_code.ts` verifies the relationship from persisted session history before authorizing the operation. Assistant continuation messages may intervene in chronological storage, so adjacency is not required. Forking at the assistant ID is forbidden because it would include the checkpoint request.

`src/session_checkpoints/open_code.ts` performs:

```text
inspect source
  -> fork before excluded user message
  -> record checkpoint ID
  -> rename checkpoint
  -> rename live continuation
  -> reread titles and checkpoint message count
  -> record verified completion
```

OpenCode-compatible forks share this adapter when they preserve the OpenCode 1.2.20 Session API and the `@opencode-ai/plugin` 1.1.25 tool interface.

## CLI and MCP entry points

`src/open_code.ts` receives trusted native plugin context and can execute directly or issue a five-minute one-time receipt. `src/command_line.ts` and `src/model_context_protocol.ts` accept receipts, never raw session/message IDs as authorization. Receipts bind the host, source session, excluded request boundary, endpoint, confidence, expiry, and nonce. The replay ledger consumes each receipt once.

Successful native calls return only the two resulting titles so routine evidence does not occupy future model context. Full operation identifiers and steps remain in the durable journal. Partial and blocked results return detailed JSON because recovery requires those diagnostics.

## Adding another host

A new host must implement `CurrentRequestMethod` and `SessionCheckpointMethod`; automatic continuation naming additionally requires `ContinuationTitleMethod`. No adapter is added until the host can verify the current request boundary and its fork/rename results. `src/transcript_archives.ts` provides separate transcript-export behavior for unsupported hosts and always reports that the host session was not changed.

## Project setup

`src/setup_open_code.ts` validates an existing target project, derives the import from `<target>/.opencode/plugins/session-bridge.ts` to this checkout's `src/open_code.ts`, and writes the loader only when the destination is absent or already identical. It uses a relative module path when both locations share a filesystem root and a file URL when they do not. Existing different content produces an explicit conflict unless the caller reviewed it and supplied `--force`.

## Evidence

`bun test` verifies working-scope normalization, custom suffix delimiters, exact OpenCode boundary resolution, numeric continuation allocation, legacy-prefix migration, title and message-count results, completed retry idempotency, partial rename records, receipt replay rejection, confidence rejection, plugin integration, and explicit transcript archival. `bun run typecheck` verifies the public TypeScript interfaces.
