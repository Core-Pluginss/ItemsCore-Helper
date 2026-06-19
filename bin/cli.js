#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")
const { autoConfigure } = require("../lib/install.js")

const HOSTED_URL = "https://www.coredevelopment.shop/api/mcp"
const LLMS_URL = "https://www.coredevelopment.shop/llms.txt"
const DOCS_URL = "https://www.coredevelopment.shop/docs/itemscore"
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
    out.push("No supported AI tools were detected. Set it up manually:")
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
