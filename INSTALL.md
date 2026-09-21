# Installation

## LLM-assisted setup

An end user can give an LLM this repository reference and a target OpenCode
project directory, then ask:

```text
Set up Session Bridge for <target-directory>. Follow INSTALL.md.
```

The LLM should use the path and shell conventions of the user's operating
system and perform this workflow:

1. Resolve the target project to an absolute path and require that it exists.
2. Set the clone destination to `<target-parent>/session-bridge`.
3. If that destination does not exist, clone this repository there using the
   repository URL available to the user.
4. If it already exists, verify that it is a Session Bridge checkout; do not
   overwrite or replace an unrelated directory.
5. Run `bun install` in the Session Bridge checkout.
6. Run `bun run setup:open-code -- <target-directory>` in the checkout.
7. Report the generated plugin file and ask the user to restart OpenCode.

Example layouts:

```text
Linux
target:   /home/example/work/test
checkout: /home/example/work/session-bridge
plugin:   /home/example/work/test/.opencode/plugins/session-bridge.ts

macOS
target:   /Users/example/work/test
checkout: /Users/example/work/session-bridge
plugin:   /Users/example/work/test/.opencode/plugins/session-bridge.ts

Windows
target:   C:\Users\Example\work\test
checkout: C:\Users\Example\work\session-bridge
plugin:   C:\Users\Example\work\test\.opencode\plugins\session-bridge.ts
```

The generated plugin file imports Session Bridge through a relative path, so
the checkout and target project can move together under the same parent.

The setup command is idempotent. If the plugin file already contains the
expected import, it reports `unchanged`. If the file contains different code,
setup stops without overwriting it. `--force` is available only after the
existing file has been reviewed.

## Manual setup

From an existing Session Bridge checkout:

```text
bun install
bun run setup:open-code -- <target-directory>
```

Restart OpenCode after setup so it discovers the new local plugin.

## Nix, NixOS, and nix-darwin

The included `flake.nix` provides the supported Bun, Node.js, and Git tools on
`x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, and `aarch64-darwin`.

With Nix flakes enabled:

```text
nix develop
bun install --frozen-lockfile
bun run setup:open-code -- <target-directory>
```

The same commands work on NixOS and nix-darwin. The flake is a development and
setup environment; it does not modify the user's NixOS or nix-darwin system
configuration. With direnv and nix-direnv, `use flake` may be added to a local
`.envrc` if automatic shell activation is preferred.
