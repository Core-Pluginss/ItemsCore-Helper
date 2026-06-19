# itemscore-helper

Set up **any** AI assistant to build and edit custom Minecraft items for the [ItemsCore](https://coredevelopment.shop/plugins/items-core) plugin. Works with Claude, Codex, Cursor, Gemini, and anything else that supports MCP or custom instructions. You do not need to know how to code.

```bash
npx itemscore-helper
```

That command drops the ItemsCore skill into a folder and prints exactly what to paste into your AI tool. Then you can ask things like *"make me a sword that calls lightning on left-click"* and your AI produces a ready-to-import item file.

## What it sets up

1. **The skill** (`SKILL.md`) - the instructions your AI follows to author correct ItemsCore items.
2. **The live API connection** (MCP) - so your AI can look up the exact methods, triggers, and item schema on the ItemsCore server and validate an item before you use it.

The MCP endpoint is:

```
https://coredevelopment.shop/api/mcp
```

## Commands

| Command | What it does |
|---|---|
| `npx itemscore-helper` | Install the skill files into `./itemscore-helper/` and print setup steps |
| `npx itemscore-helper --dir DIR` | Install into a custom folder |
| `npx itemscore-helper print` | Print the skill instructions to stdout |
| `npx itemscore-helper mcp` | Print the MCP server config |
| `npx itemscore-helper help` | Show help |

## Connecting your AI (any provider)

Pick your tool. The MCP URL is `https://coredevelopment.shop/api/mcp`.

**Cursor** - `.cursor/mcp.json`
```json
{ "mcpServers": { "itemscore": { "url": "https://coredevelopment.shop/api/mcp" } } }
```

**Claude Code** - `.mcp.json` in your project
```json
{ "mcpServers": { "itemscore": { "type": "http", "url": "https://coredevelopment.shop/api/mcp" } } }
```

**Gemini CLI** - `~/.gemini/settings.json`
```json
{ "mcpServers": { "itemscore": { "httpUrl": "https://coredevelopment.shop/api/mcp" } } }
```

**Codex / Claude Desktop / any stdio-only client** - bridge the HTTP server with `mcp-remote`:
```toml
# ~/.codex/config.toml
[mcp_servers.itemscore]
command = "npx"
args = ["-y", "mcp-remote", "https://coredevelopment.shop/api/mcp"]
```

**No MCP support?** Tell your AI to read `https://coredevelopment.shop/llms.txt` and use `https://coredevelopment.shop/api/itemscore/manifest` as the full API reference.

After connecting, give your AI the `SKILL.md` file as its instructions (paste it into the chat, or add it to `.cursorrules` / `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`).

## How you use it

1. Ask your AI for an item.
2. It writes a small `.item` (JSON) file and validates it.
3. Put that file in `plugins/ItemsCore/imports/` on your server.
4. Run `/ic import <name>` in-game. The item is live and stays editable in the in-game editor.

To edit an existing item, run `/ic export <name>`, share the exported file with your AI, and re-import the result.

## Links

- Documentation: https://coredevelopment.shop/docs/items-core
- Plugin page: https://coredevelopment.shop/plugins/items-core

## License

MIT
