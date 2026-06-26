#!/usr/bin/env node
"use strict"

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js")
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js")
const { z } = require("zod")
const M = require("../lib/manifest.js")

function getManifestArg() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf("--manifest")
  if (i !== -1 && argv[i + 1]) return argv[i + 1]
  return undefined
}

function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
}

async function main() {
  const idx = M.buildIndex(M.loadManifest(getManifestArg()))

  const server = new McpServer(
    { name: "itemscore", version: String(idx.manifest.pluginVersion || "1") },
    {
      instructions:
        "ItemsCore is a Minecraft (Bukkit/Spigot) plugin that lets server owners build custom RPG items, stats and abilities with no Java. You can do everything: build and edit items, create and edit stats, and run any plugin command. " +
        "FIRST, find the ItemsCore plugin folder. It is the folder named ItemsCore inside the server's plugins folder (plugins/ItemsCore/) and it contains an items/ folder, a stats/ folder, and config.yml. Items go in its imports/ folder, stats live in stats/stats.yml. If you cannot find a folder with those markers from where you are running, ASK THE USER for the absolute path to their ItemsCore plugin folder and use that. Never guess a path or write outside that folder. " +
        "ITEMS: use the API tools (search_methods/get_method/get_item_schema/generate_item_template), author a clean item JSON, validate it with validate_item, then save it with a .import extension (for example flame_sword.import) - never .item (.item is the plugin's own saved-item format). Put the .import file in plugins/ItemsCore/imports/ and have the user run /ic import <name>. To change an existing item, build the updated JSON with the SAME name and import again - it overwrites and keeps stats/recipe (run /ic export <name> first to get the current JSON). " +
        "STATS: read get_stat_schema, edit plugins/ItemsCore/stats/stats.yml directly (it is plain YAML), validate each stat with validate_stat, then have the user run /ic reload stats. " +
        "COMMANDS: call list_commands to know every in-game command so you can help with anything. Items authored this way stay editable in the in-game GUI." +
        (idx.isBundled
          ? " (Using the bundled API snapshot. To match this server's exact API including addon methods, run /ic exportapi and point this server at the generated plugins/ItemsCore/itemscore-api.json via --manifest or the ITEMSCORE_API env var.)"
          : " (Using the live API manifest at " + idx.source + ".)"),
    }
  )

  server.registerTool(
    "search_methods",
    {
      title: "Search ItemsCore methods",
      description:
        "Search the ItemsCore scripting API for methods by name, category, signature, or description. Returns matching methods across the core, particles, values and api bindings.",
      inputSchema: {
        query: z.string().describe("Text to search for, e.g. 'teleport', 'message', 'damage'"),
        binding: z.enum(["core", "particles", "values", "api"]).optional().describe("Restrict to a single binding"),
        includeUseless: z.boolean().optional().describe("Include methods flagged useless (Object-inherited or no-op)"),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ query, binding, includeUseless, limit }) => {
      const hits = M.searchMethods(idx, { query, binding, includeUseless, limit })
      return jsonResult({ count: hits.length, methods: hits })
    }
  )

  server.registerTool(
    "get_method",
    {
      title: "Get an ItemsCore method",
      description:
        "Get the full details (signature, params, return, description, example) of a specific method. Accepts 'core.teleport' or just 'teleport'.",
      inputSchema: {
        name: z.string().describe("Method name, optionally prefixed with its binding, e.g. 'core.teleport'"),
        binding: z.enum(["core", "particles", "values", "api"]).optional(),
      },
    },
    async ({ name, binding }) => {
      const found = M.getMethod(idx, name, binding)
      if (found.length === 0) return jsonResult({ found: false, message: 'No method named "' + name + '" was found.' })
      return jsonResult({ found: true, matches: found })
    }
  )

  server.registerTool(
    "list_triggers",
    {
      title: "List ItemsCore triggers",
      description:
        "List every action trigger (when an item's actions can run, e.g. leftAction, rightAction) and the variables available inside each.",
      inputSchema: {},
    },
    async () => jsonResult({ count: idx.triggers.length, triggers: idx.triggers })
  )

  server.registerTool(
    "list_events",
    {
      title: "List ItemsCore events and variables",
      description:
        "List the custom events and the global scripting variables (player, event, core, particles, etc.) available when writing item actions.",
      inputSchema: {},
    },
    async () => jsonResult({ events: idx.events, variables: idx.variables, bindings: idx.BINDING_NAMES })
  )

  server.registerTool(
    "get_item_schema",
    {
      title: "Get the ItemsCore item JSON schema",
      description:
        "Get the full schema and field reference for the clean item JSON that ItemsCore imports. Read this before authoring or editing an item.",
      inputSchema: {},
    },
    async () => jsonResult(M.itemSchema(idx))
  )

  server.registerTool(
    "validate_item",
    {
      title: "Validate an ItemsCore item",
      description:
        "Validate a clean item JSON object against the ItemsCore schema (unknown methods, wrong argument count, wrong argument order/type). Reports errors (must fix) and warnings (likely fine). Run this before saving. Save the result as a .import file (for example flame_sword.import), never .item.",
      inputSchema: { item: z.unknown().describe("The clean item JSON object to validate") },
    },
    async ({ item }) => jsonResult(M.validateItem(idx, item))
  )

  server.registerTool(
    "generate_item_template",
    {
      title: "Generate an ItemsCore item template",
      description:
        "Return a valid starter item JSON to build from. kind can be 'basic' (a sword that greets the server on left-click) or 'ability' (a wand triggered on right-click).",
      inputSchema: { kind: z.enum(["basic", "ability"]).optional() },
    },
    async ({ kind }) => jsonResult(M.generateItemTemplate(kind))
  )

  server.registerTool(
    "get_stat_schema",
    {
      title: "Get the ItemsCore stat format",
      description:
        "Get the format and field reference for ItemsCore stats (the named values like Strength shown on items). Read this before creating or editing a stat. Stats live in plugins/ItemsCore/stats/stats.yml and are applied with /ic reload stats.",
      inputSchema: {},
    },
    async () => jsonResult(M.statSchema())
  )

  server.registerTool(
    "validate_stat",
    {
      title: "Validate an ItemsCore stat",
      description:
        "Validate a single stat object (name, fancyName, fancyValue, baseValue) before writing it into stats.yml. Reports errors (must fix) and warnings.",
      inputSchema: { stat: z.unknown().describe("The stat object to validate") },
    },
    async ({ stat }) => jsonResult(M.validateStat(stat))
  )

  server.registerTool(
    "list_commands",
    {
      title: "List ItemsCore commands",
      description:
        "List every in-game command of the ItemsCore plugin (and common addon commands) with usage, description and permission, so you can help the user run the plugin: import/export/reload items, manage stats, open editors, install addons, and more.",
      inputSchema: {},
    },
    async () => jsonResult(M.commandList())
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((e) => {
  process.stderr.write("itemscore-helper MCP server failed to start: " + (e && e.stack ? e.stack : e) + "\n")
  process.exit(1)
})
