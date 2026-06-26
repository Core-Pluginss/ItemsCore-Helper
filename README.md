# itemscore-helper

Set up **any** AI assistant to build and edit custom Minecraft items for the [ItemsCore](https://www.coredevelopment.shop/plugins/itemscore) plugin. Works with Claude, Codex, Cursor, Gemini, and anything else that supports MCP or custom instructions. You do not need to know how to code.

## Easiest: paste one prompt into your AI

Copy the prompt below and paste it into your AI (Claude, Cursor, Gemini, Codex, anything). It downloads and connects the ItemsCore tools itself, then asks what item you want - no terminal knowledge needed:

```text
You are my coding agent and I do not know how to code, so do the whole setup yourself - actually run the commands, do not just tell me what to run.

1. In my project folder, run this to download and connect the ItemsCore tools:
   npx -y itemscore-helper install
   It installs a local helper and wires an "itemscore" MCP server into this project. When it finishes, reload your MCP servers (or ask me to restart this app) so the itemscore tools load. If you truly cannot run commands, add this to your MCP config instead:
   {"mcpServers":{"itemscore":{"command":"npx","args":["-y","itemscore-helper","serve"]}}}

2. Read https://www.coredevelopment.shop/llms.txt so you know the ItemsCore item format, how stats work, the in-game commands, and every method available.

3. Find my ItemsCore plugin folder (plugins/ItemsCore/ - it has items/, stats/ and config.yml). If you cannot find it, ask me for its full path before writing anything.

4. Tell me you are ready, then ask what I want to build. You can make and edit items, create and edit stats, and tell me the right commands. For an item: build a valid .import file (clean item JSON), validate it, and tell me to drop it in plugins/ItemsCore/imports/ and run /ic import in-game. For a stat: edit plugins/ItemsCore/stats/stats.yml and tell me to run /ic reload stats. Items stay fully editable in the in-game editor.
```

The same prompt is on the [docs page](https://www.coredevelopment.shop/docs/itemscore) with a one-click Copy button.

## Or set it up in one command

```bash
npx itemscore-helper
```

This auto-detects the AI tools on your machine and connects the local MCP server to each one (a backup of every file it changes is saved beside it). Then just ask your AI for an item.

## What it sets up

1. **The skill** (`SKILL.md`) - the instructions your AI follows to author correct ItemsCore items.
2. **A local MCP server** - runs on your machine (no account, no hosting, works offline) so your AI can look up the exact methods, triggers, and item schema and validate an item before you use it.

The MCP server is `npx -y itemscore-helper serve`. It speaks the standard stdio MCP transport, which every MCP client supports.

## Commands

| Command | What it does |
|---|---|
| `npx itemscore-helper` | Auto-detect your AI tools and connect the local MCP server |
| `npx itemscore-helper --dry-run` | Show what would change, without writing anything |
| `npx itemscore-helper doctor` | Check and repair the setup: restore missing skill files, re-wire the MCP server, validate the API, check for updates |
| `npx itemscore-helper serve` | Run the local MCP server (this is what your AI runs) |
| `npx itemscore-helper print` | Print the skill instructions to stdout |
| `npx itemscore-helper mcp` | Print the MCP server config |
| `npx itemscore-helper help` | Show help |

## Connecting your AI (any provider)

Add the local MCP server. The config is the same everywhere: run `npx -y itemscore-helper serve`.

**Cursor** - `.cursor/mcp.json`
```json
{ "mcpServers": { "itemscore": { "command": "npx", "args": ["-y", "itemscore-helper", "serve"] } } }
```

**Claude Code** - `.mcp.json` in your project (or `claude_desktop_config.json` for Claude Desktop)
```json
{ "mcpServers": { "itemscore": { "command": "npx", "args": ["-y", "itemscore-helper", "serve"] } } }
```

**Gemini CLI** - `~/.gemini/settings.json`
```json
{ "mcpServers": { "itemscore": { "command": "npx", "args": ["-y", "itemscore-helper", "serve"] } } }
```

**Codex** - `~/.codex/config.toml`
```toml
[mcp_servers.itemscore]
command = "npx"
args = ["-y", "itemscore-helper", "serve"]
```

### Staying up to date and verifying the setup

The MCP server runs as `npx -y itemscore-helper@latest serve`, so npx re-resolves the newest published helper each time it starts instead of reusing a cached old copy. The server and the `install` command also check npm on start and tell you (and your AI) when a newer version is out. To force a refresh at any time: `npx -y itemscore-helper@latest install`, then reload your MCP servers.

Your AI should **verify, not assume**, that the tooling is connected. The MCP server exposes a `health_check` tool that confirms it is reachable, lists the available tools, reports the API version and method count, checks the skill files exist, and flags an outdated helper or a stale exported API - returning an `ok` flag and a `nextActions` list. A well-behaved agent calls it at the start of a session and after installing, and only tells you it is set up once that returns `ok`. If files were removed or the install is incomplete, `npx -y itemscore-helper@latest doctor` checks and repairs the setup (restores missing skill files, re-wires the MCP server, validates the API, checks for updates).

### Use your server's exact API (optional)

By default the server ships with a snapshot of the standard ItemsCore API. If you use addons that add methods, run `/ic exportapi` in-game and point the server at the generated file so it knows your exact API:

- set an env var `ITEMSCORE_API=/path/to/plugins/ItemsCore/itemscore-api.json`, or
- add `"--manifest", "/path/to/itemscore-api.json"` to the `args`.

An auto-detected `plugins/ItemsCore/itemscore-api.json` is used only when it is at least as new as the bundled API. If it is from an older plugin version (you updated the plugin but did not re-run `/ic exportapi`), it is ignored in favour of the current bundled API so your AI never builds against a dead manifest - re-run `/ic exportapi` to refresh it.

### Prefer not to install anything?

A hosted copy of the same server is also available (no install): `https://www.coredevelopment.shop/api/mcp` (Streamable HTTP), with `https://www.coredevelopment.shop/llms.txt` as a plain-text guide.

After connecting, give your AI the `SKILL.md` file as its instructions (paste it into the chat, or add it to `.cursorrules` / `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`).

## How you use it

1. Ask your AI for an item.
2. It writes a small `.import` (JSON) file and validates it.
3. Put that file in `plugins/ItemsCore/imports/` on your server.
4. Run `/ic import <name>` in-game. The item is live and stays editable in the in-game editor.

To edit an existing item, run `/ic export <name>`, share the exported file with your AI, and re-import the result.

## Links

- Documentation: https://www.coredevelopment.shop/docs/itemscore
- Plugin page: https://www.coredevelopment.shop/plugins/itemscore

## License

MIT
