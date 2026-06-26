#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")
const { autoConfigure } = require("../lib/install.js")

const HOSTED_URL = "https://www.coredevelopment.shop/api/mcp"
const LLMS_URL = "https://www.coredevelopment.shop/llms.txt"
const DOCS_URL = "https://www.coredevelopment.shop/docs/itemscore"
const SKILL_DIR = path.join(__dirname, "..", "skill")

const SETUP_PROMPT = [
  "You are my coding agent and I do not know how to code, so do the whole setup yourself - actually run the commands, do not just tell me what to run.",
  "",
  "1. In my project folder, run this to download and connect the ItemsCore tools:",
  "   npx -y itemscore-helper install",
  '   It installs a local helper and wires an "itemscore" MCP server into this project. When it finishes, reload your MCP servers (or ask me to restart this app) so the itemscore tools load. If you truly cannot run commands, add this to your MCP config instead:',
  '   {"mcpServers":{"itemscore":{"command":"npx","args":["-y","itemscore-helper","serve"]}}}',
  "",
  "2. Read " + LLMS_URL + " so you know the ItemsCore item format, how stats work, the in-game commands, and every method available.",
  "",
  "3. Find my ItemsCore plugin folder (plugins/ItemsCore/ - it has items/, stats/ and config.yml). If you cannot find it, ask me for its full path before writing anything.",
  "",
  "4. Tell me you are ready, then ask what I want to build. You can make and edit items, create and edit stats, and tell me the right commands. For an item: build the clean item JSON, validate it with validate_item, and save it as a file ending in .import (for example flame_sword.import) - never .item. Tell me to drop it in plugins/ItemsCore/imports/ and run /ic import in-game. To change an item I already imported, edit the JSON and import it again with the same name (it overwrites). For a stat: read get_stat_schema, edit plugins/ItemsCore/stats/stats.yml, then tell me to run /ic reload stats. Items stay fully editable in the in-game editor.",
].join("\n")

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
  const out = { cmd: "install", dryRun: false }
  const rest = []
  for (const a of argv) {
    if (a === "-h" || a === "--help") out.cmd = "help"
    else if (a === "--dry-run") out.dryRun = true
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
    "  npx itemscore-helper            Auto-detect your AI tools and connect the local MCP server",
    "  npx itemscore-helper --dry-run  Show what would be changed, without writing anything",
    "  npx itemscore-helper serve      Run the local MCP server (this is what your AI runs)",
    "  npx itemscore-helper print      Print the skill instructions (SKILL.md) to stdout",
    "  npx itemscore-helper mcp        Print the MCP server config",
    "  npx itemscore-helper help       Show this help",
    "",
    "Don't want to use a terminal? Copy the setup prompt from " + DOCS_URL + " and paste it into your AI - it does the rest.",
    "Supports Claude (Code & Desktop), Cursor, Gemini CLI, Codex, Windsurf and any MCP client.",
    "Docs: " + DOCS_URL,
    "",
  ].join("\n"))
}

function printMcp() {
  console.log(
    JSON.stringify({ mcpServers: { itemscore: { command: "npx", args: ["-y", "itemscore-helper", "serve"] } } }, null, 2)
  )
}

function printSkill() {
  process.stdout.write(fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8"))
}

function manualLines() {
  return [
    "  Add this to your AI client's MCP config (same for Claude, Cursor, Gemini):",
    '    {"mcpServers":{"itemscore":{"command":"npx","args":["-y","itemscore-helper","serve"]}}}',
    "  Codex (~/.codex/config.toml):",
    "    [mcp_servers.itemscore]",
    '    command = "npx"',
    '    args = ["-y","itemscore-helper","serve"]',
    "  No MCP client? A hosted copy is at " + HOSTED_URL + " (guide: " + LLMS_URL + ").",
  ]
}

function runInstall(dryRun) {
  const targetDir = path.resolve(process.cwd(), "itemscore-helper")
  if (!dryRun) copyDir(SKILL_DIR, targetDir)

  const results = autoConfigure({ dryRun })
  const configured = results.filter((r) => r.ok)

  const out = ["", dryRun ? "ItemsCore helper - dry run (nothing was changed):" : "ItemsCore helper installed.", ""]

  if (configured.length > 0) {
    out.push(dryRun ? "Would connect the ItemsCore MCP server to:" : "Connected the ItemsCore MCP server to:")
    for (const r of results) {
      if (r.ok) out.push("  + " + r.name + (r.already ? " (already set)" : "") + "  ->  " + r.file)
      else out.push("  ! " + r.name + " skipped: " + r.reason)
    }
    if (!dryRun) {
      out.push("")
      out.push("Restart your AI app, then just ask it to build an ItemsCore item.")
      out.push("A backup of each changed file was saved beside it (*.itemscore-bak).")
    }
  } else {
    out.push("No AI tool configs were detected on this machine. Two easy options:")
    out.push("")
    out.push("  1. Paste this prompt into your AI and it sets itself up:")
    out.push("")
    out.push(SETUP_PROMPT.split("\n").map((l) => "     " + l).join("\n"))
    out.push("")
    out.push("  2. Or add the MCP server to your AI client's config yourself:")
    out.push(...manualLines())
  }

  if (!dryRun) {
    out.push("")
    out.push("Skill files written to " + targetDir + " - hand SKILL.md to your AI if it asks for guidance.")
  }
  out.push("")
  console.log(out.join("\n"))
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
  runInstall(args.dryRun)
}

main()
