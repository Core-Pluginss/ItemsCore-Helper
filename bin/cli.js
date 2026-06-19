#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")

const MCP_URL = "https://coredevelopment.shop/api/mcp"
const LLMS_URL = "https://coredevelopment.shop/llms.txt"
const MANIFEST_URL = "https://coredevelopment.shop/api/itemscore/manifest"
const DOCS_URL = "https://coredevelopment.shop/docs/items-core"
const SKILL_DIR = path.join(__dirname, "..", "skill")

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function parseArgs(argv) {
  const out = { cmd: "install", dir: "itemscore-helper" }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dir") out.dir = argv[++i]
    else if (a === "-h" || a === "--help") out.cmd = "help"
    else rest.push(a)
  }
  if (rest[0]) out.cmd = rest[0]
  return out
}

function printHelp() {
  console.log([
    "",
    "itemscore-helper - set up any AI to build ItemsCore items",
    "",
    "Usage",
    "  npx itemscore-helper            Install the skill files here and print setup steps",
    "  npx itemscore-helper install    Same as above",
    "  npx itemscore-helper --dir DIR  Install into a custom folder (default: itemscore-helper)",
    "  npx itemscore-helper print      Print the skill instructions (SKILL.md) to stdout",
    "  npx itemscore-helper mcp        Print the MCP server config",
    "  npx itemscore-helper help       Show this help",
    "",
    "Works with Claude, Codex, Cursor, Gemini, and any other AI that supports MCP or custom instructions.",
    "Docs: " + DOCS_URL,
    "",
  ].join("\n"))
}

function printMcp() {
  console.log(
    JSON.stringify({ mcpServers: { itemscore: { type: "http", url: MCP_URL } } }, null, 2)
  )
}

function printSkill() {
  process.stdout.write(fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8"))
}

function printGuide(targetDir) {
  const skillPath = path.join(targetDir, "SKILL.md")
  console.log([
    "",
    "ItemsCore helper installed.",
    "",
    "Files written to " + targetDir + ":",
    "  SKILL.md          the instructions to give your AI",
    "  ITEM_FORMAT.md    the full item format reference",
    "  mcp.json          the MCP server config",
    "  examples/         ready-made example items",
    "",
    "Two things to set up in your AI:",
    "",
    "1) Connect the live ItemsCore API (MCP) - recommended",
    "   Endpoint (Streamable HTTP):  " + MCP_URL,
    "",
    "   Cursor        .cursor/mcp.json",
    '     {"mcpServers":{"itemscore":{"url":"' + MCP_URL + '"}}}',
    "",
    "   Claude Code   .mcp.json in your project",
    '     {"mcpServers":{"itemscore":{"type":"http","url":"' + MCP_URL + '"}}}',
    "",
    "   Gemini CLI    ~/.gemini/settings.json",
    '     {"mcpServers":{"itemscore":{"httpUrl":"' + MCP_URL + '"}}}',
    "",
    "   Codex, Claude Desktop, or any stdio-only client",
    "     Use the bridge command (no native HTTP needed):",
    "       npx mcp-remote " + MCP_URL,
    "     Codex  ~/.codex/config.toml:",
    "       [mcp_servers.itemscore]",
    '       command = "npx"',
    '       args = ["-y","mcp-remote","' + MCP_URL + '"]',
    "",
    "   No MCP at all? Tell your AI to read " + LLMS_URL,
    "     and use " + MANIFEST_URL + " as the full API reference.",
    "",
    "2) Give your AI the skill",
    "   Load " + skillPath + " as the AI's instructions / rules:",
    "   Cursor        copy SKILL.md into .cursor/rules/itemscore.md (or .cursorrules)",
    "   Claude Code   copy SKILL.md into .claude/skills/ or append it to CLAUDE.md",
    "   Codex         append SKILL.md to AGENTS.md",
    "   Gemini CLI    append SKILL.md to GEMINI.md",
    "   Anything else paste SKILL.md into the chat or system prompt",
    "",
    'Then just ask: "make me a sword that calls lightning on left-click".',
    "Your AI writes a .item file; drop it in plugins/ItemsCore/imports/ and run /ic import <name>.",
    "",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.cmd === "help") return printHelp()
  if (args.cmd === "mcp") return printMcp()
  if (args.cmd === "print") return printSkill()
  if (args.cmd !== "install") {
    console.error("Unknown command: " + args.cmd + "\nRun: npx itemscore-helper help")
    process.exitCode = 1
    return
  }
  const targetDir = path.resolve(process.cwd(), args.dir)
  copyDir(SKILL_DIR, targetDir)
  printGuide(targetDir)
}

main()
