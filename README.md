# ccmcp

A CLI tool for managing MCP (Model Context Protocol) servers used by Claude Code. It maintains a central registry at `~/.ccmcp/config.json` as the source of truth, and lets you link/unlink servers into Claude Code's config per-project or globally — without ever touching entries you didn't add.

## How it works

ccmcp keeps its own registry (`~/.ccmcp/config.json`) separate from Claude Code's config (`~/.claude.json`). You manage servers in the registry, then sync them into Claude Code's config with `ccmcp sync` or `ccmcp link`. Only entries that ccmcp owns are ever modified; servers you added manually in Claude Code are left untouched.

Servers in the registry can be kept **disabled** — they exist in the registry but are not written to Claude Code's config until you enable them. This lets you store server configs you don't always need and toggle them on or off with `ccmcp update <name> --enable true/false` followed by `ccmcp sync`.

## Installation

### One-line install (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/iambpn/ccmcp/main/scripts/install.sh | bash
```

This downloads the latest release binary, verifies its checksum, and installs it to `~/.local/bin/ccmcp`.

If `~/.local/bin` is not in your `PATH`, the installer will tell you exactly what to add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.).

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/iambpn/ccmcp/main/scripts/install.sh | bash -s -- --uninstall
```

### Windows

Download the latest `ccmcp-win.exe` from the [Releases](https://github.com/iambpn/ccmcp/releases) page and place it somewhere on your `PATH`.

### npm (global)

```bash
npm install -g ccmcp
```

## Commands

### `ccmcp add <name>`

Add an MCP server to the registry.

```bash
# stdio server
ccmcp add my-server --transport stdio --command npx --args my-mcp-pkg

# HTTP/SSE server
ccmcp add my-api --transport http --url https://mcp.example.com/sse

# With environment variables
ccmcp add my-server --transport stdio --command npx --args my-mcp-pkg \
  --env API_KEY=abc123 --env DEBUG=true

# Add and immediately sync to Claude Code
ccmcp add my-server --transport stdio --command npx --args my-mcp-pkg --enabled

# Raw JSON config
ccmcp add my-server --json '{"type":"stdio","command":"npx","args":["my-pkg"]}'
```

**Options:**

| Option | Description |
|--------|-------------|
| `--transport <type>` | `stdio`, `http`, `sse`, or `ws` |
| `--command <cmd>` | Executable for stdio servers |
| `--args <arg...>` | Arguments for the command |
| `--env <KEY=VALUE>` | Environment variable (repeatable) |
| `--url <url>` | URL for http/sse/ws servers |
| `--header <KEY:VALUE>` | HTTP header (repeatable) |
| `--json <json>` | Raw server config as JSON |
| `--scope <scope>` | `global` or `project` (default: `project`) |
| `--project <path...>` | Project paths for project-scoped servers (default: cwd) |
| `--enabled` | Enable and sync to Claude Code immediately |

---

### `ccmcp list` (alias: `ls`)

List all servers in the registry with their status.

```bash
ccmcp list
```

Output shows name, scope, enabled status, and which locations each server has been deployed to.

---

### `ccmcp get <name>`

Show the full config for a single server.

```bash
ccmcp get my-server
```

---

### `ccmcp update <name>`

Update a server's enabled state or scope.

```bash
# Enable a server
ccmcp update my-server --enable true

# Disable a server
ccmcp update my-server --enable false

# Change to global scope
ccmcp update my-server --scope global

# Change to project scope for a specific project
ccmcp update my-server --scope project --project /path/to/project
```

---

### `ccmcp link <name>`

Write a single server from the registry into Claude Code's config for the current project (or globally, if the server is global-scoped).

```bash
ccmcp link my-server
```

---

### `ccmcp unlink <name>`

Remove a single server from Claude Code's config.

```bash
ccmcp unlink my-server
```

---

### `ccmcp sync`

Reconcile the entire registry into Claude Code's config. Enabled servers are written; disabled servers are removed. Only entries previously written by ccmcp are touched.

```bash
ccmcp sync
```

Run this after changing multiple servers or after editing the registry manually.

---

### `ccmcp remove <name>` (alias: `rm`)

Remove a server from the registry entirely.

```bash
ccmcp remove my-server
```

---

### `ccmcp import`

Import MCP servers that already exist in Claude Code's config into the ccmcp registry.

```bash
ccmcp import

# Overwrite existing registry entries
ccmcp import --overwrite
```

Existing Claude Code config is left unchanged; only the registry is updated.

---

## Registry files

| File | Purpose |
|------|---------|
| `~/.ccmcp/config.json` | Registry — source of truth for all managed servers |
| `~/.ccmcp/state.json` | Tracks which locations ccmcp last wrote to, for safe reconciliation |

The `CCMCP_HOME` environment variable overrides `~/.ccmcp` (useful for testing).

Two environment variables control which `.claude.json` file ccmcp reads and writes:

| Variable | Behaviour |
|----------|-----------|
| `CCMCP_CLAUDE_CONFIG` | Full path to the `.claude.json` file — takes precedence over everything else |
| `CLAUDE_CONFIG_DIR` | Directory that contains `.claude.json`; ccmcp appends `/.claude.json` to this path |

If neither is set, ccmcp defaults to `~/.claude.json`.

## Scopes

- **global** — server is written to Claude Code's user-level config (`~/.claude.json`), available in all projects.
- **project** — server is written into a specific project's config section, available only in that project. Defaults to the current working directory.

## Development

```bash
npm install
npm run build      # compile TypeScript
npm test           # run tests
npm run bundle     # bundle for packaging
npm run package    # build standalone binaries
```
