# Goal — Implement portable OpenCode-compatible session checkpointing

## Objective
Implement a portable Session Bridge whose OpenCode-compatible plugin creates an exact checkpoint before the current user request, renames the checkpoint and live continuation, and exposes receipt-gated CLI/MCP entry points for future host integrations. Preserve explicit checkpoint titles, deterministic continuation-title allocation, trusted authorization, durable partial-operation records, and explicit errors for unsupported hosts.

## Progress
- [x] Architecture approved
- [x] Scaffold TypeScript package and modules
- [x] Implement checkpoint kernel and operation journal
- [x] Implement OpenCode-compatible plugin
- [x] Implement receipt-gated CLI and MCP entrances
- [x] Implement explicit transcript archival behavior
- [x] Implement safe, idempotent OpenCode project setup
- [x] Support platform-neutral setup and Nix development shells
- [x] Verify interfaces, behavior, build, and module boundaries
- [x] Allocate numeric continuation prefixes and make continuation titles optional

## Decisions
- Use a hybrid core plus native OpenCode-compatible plugin plus receipt-gated CLI/MCP entrances.
- Keep checkpoint titles explicit. Allow an explicit continuation title override; otherwise preserve the current `NN` prefix or allocate the smallest unused `NN` prefix.
- Permit changes only from exact or verified authorization; discovery with lower confidence is read-only.
- Treat transcript archival as separate explicit behavior, never a silent checkpoint fallback.
- Add host integrations only after their session boundary and mutation APIs are verified.
- In OpenCode, the tool context message is the assistant response; resolve its parent user message and fork before that parent to exclude the checkpoint request.
- Operation identity includes harness, endpoint, directory, session, excluded request, expected prefix count, and both resolved titles.
- A prior non-complete operation blocks automatic retry as effect-uncertain; durable host effects are never deleted as rollback.
- OpenCode-compatible plugin tools return JSON strings so both the OpenCode 1.1.25 string-only plugin interface and newer OpenCode tool-result interfaces accept the output.
- Exact boundary proof follows persisted `assistant.parentID`; chronological adjacency is not required because one user request may produce multiple assistant continuation messages.
- Project setup derives a relative plugin import from the checkout and target paths and refuses to overwrite different existing content without an explicit `--force`.
- Setup documentation uses generic Windows, Linux, and macOS paths; `flake.nix` supplies Bun, Node.js, and Git on Linux and Darwin systems supported by Nix.
- Automatic continuation naming retains a leading `NN` source prefix; otherwise it allocates the smallest unused `NN` and produces `NN <checkpointTitle>`. Explicit continuation titles remain valid overrides.

## Evidence
- `bun test`: 19 tests pass, covering exact boundary resolution, numeric continuation allocation, legacy-prefix migration, explicit overrides, direct and receipt execution, replay rejection, partial effects, plugin integration, transcript archival, and project setup.
- `bun run typecheck`: passes.
- `bun run build`: five public entrypoints bundle successfully.
- `flake.lock` parses as valid JSON; full Nix evaluation requires a Linux or macOS environment with Nix installed.

## Children
[[session-bridge-architecture]] — Approved architecture and execution workflow for exact portable conversation checkpointing
