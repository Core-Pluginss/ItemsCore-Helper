#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")

const HOSTED_URL = "https://www.coredevelopment.shop/api/mcp"
const LLMS_URL = "https://www.coredevelopment.shop/llms.txt"
const DOCS_URL = "https://www.coredevelopment.shop/docs/items-core"
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
    "  npx itemscore-helper serve      Run the local MCP server (this is what your AI runs)",
    "  npx itemscore-helper print      Print the skill instructions (SKILL.md) to stdout",
    "  npx itemscore-helper mcp        Print the MCP server config",
    "  npx itemscore-helper help       Show this help",
    "",
    "The MCP server runs locally on your machine over stdio. Works with Claude, Codex, Cursor,",
    "Gemini, and any other AI that supports MCP.",
    "Docs: " + DOCS_URL,
    "",
  ].join("\n"))
}

function printMcp() {
  console.log(
    JSON.stringify(
      { mcpServers: { itemscore: { command: "npx", args: ["-y", "itemscore-helper", "serve"] } } },
      null,
      2
    )
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
    "1) Add the local ItemsCore MCP server (runs on your machine over stdio)",
    "   Same config for every client - command npx, args [-y, itemscore-helper, serve]:",
    "",
    "   Cursor        .cursor/mcp.json",
    '     {"mcpServers":{"itemscore":{"command":"npx","args":["-y","itemscore-helper","serve"]}}}',
    "",
    "   Claude Code   .mcp.json in your project (or claude_desktop_config.json for Desktop)",
    '     {"mcpServers":{"itemscore":{"command":"npx","args":["-y","itemscore-helper","serve"]}}}',
    "",
    "   Gemini CLI    ~/.gemini/settings.json",
    '     {"mcpServers":{"itemscore":{"command":"npx","args":["-y","itemscore-helper","serve"]}}}',
    "",
    "   Codex         ~/.codex/config.toml",
    "     [mcp_servers.itemscore]",
    '     command = "npx"',
    '     args = ["-y","itemscore-helper","serve"]',
    "",
    "   To match YOUR server's exact API (including addon methods), run /ic exportapi in-game",
    "   and point the server at the generated file, either with the env var:",
    "     ITEMSCORE_API=/path/to/plugins/ItemsCore/itemscore-api.json",
    '   or by adding "--manifest","/path/to/itemscore-api.json" to the args. Otherwise it uses',
    "   a bundled snapshot of the standard API.",
    "",
    "   No MCP support at all? An online copy also exists at " + HOSTED_URL,
    "   and a plain-text guide at " + LLMS_URL,
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
  if (args.cmd === "serve") {
    require("./mcp.js")
    return
  }
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
