# Session Bridge Setup

Project knowledge lives in `.doc/`. Do not create a parallel `.dosa/` knowledge path.

When asked to install this repository for an OpenCode project, follow
`INSTALL.md`. Clone or reuse Session Bridge at `<target-parent>/session-bridge`,
run `bun install`, then run `bun run setup:open-code -- <target-directory>`.
Use native path and shell conventions on Windows, Linux, or macOS. When Nix is
available, `nix develop` provides Bun, Node.js, and Git for Linux and Darwin.

Never overwrite an unrelated checkout or an existing plugin loader without
showing the conflict to the user. A successful setup must report the generated
`.opencode/plugins/session-bridge.ts` path and that OpenCode must be restarted.
