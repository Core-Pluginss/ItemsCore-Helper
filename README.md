# itemscore-helper

Set up **any** AI assistant to build and edit custom Minecraft items for the [ItemsCore](https://www.coredevelopment.shop/plugins/itemscore) plugin. Works with Claude, Codex, Cursor, Gemini, and anything else that supports MCP or custom instructions. You do not need to know how to code.

## Easiest: let your AI set itself up

Run this, copy what it prints, and paste it into your AI (Claude, Cursor, Gemini, Codex, anything):

```bash
npx itemscore-helper prompt
```

Your AI reads the prompt, sets up the ItemsCore tools itself, then asks what item you want. No config files, no terminal knowledge needed.

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
| `npx itemscore-helper prompt` | Print a prompt to paste into your AI so it sets itself up |
| `npx itemscore-helper --dry-run` | Show what would change, without writing anything |
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

### Use your server's exact API (optional)

By default the server ships with a snapshot of the standard ItemsCore API. If you use addons that add methods, run `/ic exportapi` in-game and point the server at the generated file so it knows your exact API:

- set an env var `ITEMSCORE_API=/path/to/plugins/ItemsCore/itemscore-api.json`, or
- add `"--manifest", "/path/to/itemscore-api.json"` to the `args`.

### Prefer not to install anything?

A hosted copy of the same server is also available (no install): `https://www.coredevelopment.shop/api/mcp` (Streamable HTTP), with `https://www.coredevelopment.shop/llms.txt` as a plain-text guide.

After connecting, give your AI the `SKILL.md` file as its instructions (paste it into the chat, or add it to `.cursorrules` / `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`).

## How you use it

1. Ask your AI for an item.
2. It writes a small `.item` (JSON) file and validates it.
3. Put that file in `plugins/ItemsCore/imports/` on your server.
4. Run `/ic import <name>` in-game. The item is live and stays editable in the in-game editor.

To edit an existing item, run `/ic export <name>`, share the exported file with your AI, and re-import the result.

## Links

- Documentation: https://www.coredevelopment.shop/docs/itemscore
- Plugin page: https://www.coredevelopment.shop/plugins/itemscore

## License

MIT
