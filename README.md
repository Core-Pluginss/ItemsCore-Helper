# itemscore-helper

Set up **any** AI assistant to build and edit custom Minecraft items for the [ItemsCore](https://www.coredevelopment.shop/plugins/items-core) plugin. Works with Claude, Codex, Cursor, Gemini, and anything else that supports MCP or custom instructions. You do not need to know how to code.

```bash
npx itemscore-helper
```

That command drops the ItemsCore skill into a folder and prints exactly what to paste into your AI tool. Then you can ask things like *"make me a sword that calls lightning on left-click"* and your AI produces a ready-to-import item file.

## What it sets up

1. **The skill** (`SKILL.md`) - the instructions your AI follows to author correct ItemsCore items.
2. **A local MCP server** - runs on your machine (no account, no hosting, works offline) so your AI can look up the exact methods, triggers, and item schema and validate an item before you use it.

The MCP server is `npx -y itemscore-helper serve`. It speaks the standard stdio MCP transport, which every MCP client supports.

## Commands

| Command | What it does |
|---|---|
| `npx itemscore-helper` | Install the skill files into `./itemscore-helper/` and print setup steps |
| `npx itemscore-helper --dir DIR` | Install into a custom folder |
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

- Documentation: https://www.coredevelopment.shop/docs/items-core
- Plugin page: https://www.coredevelopment.shop/plugins/items-core

## License

MIT
