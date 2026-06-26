"use strict"

const fs = require("fs")
const path = require("path")
const os = require("os")

// "@latest" so npx re-resolves the newest published helper on each start instead of
// silently reusing a cached old copy - keeps the API and tools current.
const ENTRY = { command: "npx", args: ["-y", "itemscore-helper@latest", "serve"] }
const TOML_BLOCK = '\n[mcp_servers.itemscore]\ncommand = "npx"\nargs = ["-y", "itemscore-helper@latest", "serve"]\n'

function homeDir() {
  return process.env.ITEMSCORE_HOME_OVERRIDE || os.homedir()
}

function backup(file) {
  const bak = file + ".itemscore-bak"
  if (fs.existsSync(file) && !fs.existsSync(bak)) {
    try {
      fs.copyFileSync(file, bak)
    } catch {
      /* best effort */
    }
  }
}

function mergeJsonMcp(file, key) {
  let data = {}
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, "utf8").trim()
    if (txt) {
      try {
        data = JSON.parse(txt)
      } catch {
        return { ok: false, reason: "existing config is not valid JSON; left untouched" }
      }
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, reason: "existing config is not a JSON object; left untouched" }
  }
  if (!data[key] || typeof data[key] !== "object") data[key] = {}
  const already = JSON.stringify(data[key].itemscore) === JSON.stringify(ENTRY)
  data[key].itemscore = ENTRY
  backup(file)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n")
  return { ok: true, already }
}

function appendTomlMcp(file) {
  const txt = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  if (txt.includes("[mcp_servers.itemscore]")) return { ok: true, already: true }
  backup(file)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const next = txt.trim() ? txt.trimEnd() + "\n" + TOML_BLOCK : TOML_BLOCK.replace(/^\n/, "")
  fs.writeFileSync(file, next)
  return { ok: true, already: false }
}

function globalTargets() {
  const h = homeDir()
  const list = [
    { name: "Cursor", dir: path.join(h, ".cursor"), file: path.join(h, ".cursor", "mcp.json"), kind: "json", key: "mcpServers" },
    { name: "Codex", dir: path.join(h, ".codex"), file: path.join(h, ".codex", "config.toml"), kind: "toml" },
    { name: "Gemini CLI", dir: path.join(h, ".gemini"), file: path.join(h, ".gemini", "settings.json"), kind: "json", key: "mcpServers" },
    { name: "Windsurf", dir: path.join(h, ".codeium", "windsurf"), file: path.join(h, ".codeium", "windsurf", "mcp_config.json"), kind: "json", key: "mcpServers" },
  ]
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(h, "AppData", "Roaming")
    list.push({ name: "Claude Desktop", dir: path.join(appData, "Claude"), file: path.join(appData, "Claude", "claude_desktop_config.json"), kind: "json", key: "mcpServers" })
  } else if (process.platform === "darwin") {
    list.push({ name: "Claude Desktop", dir: path.join(h, "Library", "Application Support", "Claude"), file: path.join(h, "Library", "Application Support", "Claude", "claude_desktop_config.json"), kind: "json", key: "mcpServers" })
  } else {
    list.push({ name: "Claude Desktop", dir: path.join(h, ".config", "Claude"), file: path.join(h, ".config", "Claude", "claude_desktop_config.json"), kind: "json", key: "mcpServers" })
  }
  return list
}

function isProjectDir(cwd) {
  return [".git", "package.json", ".cursor", ".claude", ".vscode"].some((m) => fs.existsSync(path.join(cwd, m)))
}

function applyTarget(t, dryRun) {
  if (dryRun) return { name: t.name, file: t.file, ok: true, already: false, dry: true }
  const r = t.kind === "json" ? mergeJsonMcp(t.file, t.key) : appendTomlMcp(t.file)
  return { name: t.name, file: t.file, ...r }
}

/**
 * Detects installed AI tools and writes the itemscore MCP server into each one's
 * config (creating a backup first). Returns a list describing what happened.
 */
function autoConfigure(opts) {
  opts = opts || {}
  const dryRun = !!opts.dryRun
  const cwd = opts.cwd || process.cwd()
  const results = []

  for (const t of globalTargets()) {
    const present = fs.existsSync(t.dir) || fs.existsSync(t.file)
    if (!present) continue
    results.push({ scope: "global", ...applyTarget(t, dryRun) })
  }

  // Project-scoped .mcp.json for Claude Code, VS Code and project-level Cursor.
  if (isProjectDir(cwd)) {
    const file = path.join(cwd, ".mcp.json")
    results.push({ scope: "project", name: "Project (.mcp.json)", file, ...(dryRun ? { ok: true, dry: true } : mergeJsonMcp(file, "mcpServers")) })
  }

  return results
}

module.exports = { autoConfigure, globalTargets, isProjectDir, ENTRY }
