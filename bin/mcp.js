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
        "ItemsCore is a Minecraft (Bukkit/Spigot) plugin that lets server owners build custom RPG items with no Java. Use these tools to look up the scripting API, then author a clean item JSON (get_item_schema / generate_item_template) and validate it (validate_item). IMPORTANT: save the file with a .import extension, for example flame_sword.import - never .item (.item is the plugin's own saved-item format, the user must not author that). Tell the user to drop the .import file in plugins/ItemsCore/imports/ and run /ic import <name>. To change an item that is already imported, build the updated JSON with the SAME name and import it again - it overwrites the existing item and keeps its stats and recipe (run /ic export <name> first to get the current JSON if you do not have it). Items authored this way stay editable in the in-game GUI." +
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

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((e) => {
  process.stderr.write("itemscore-helper MCP server failed to start: " + (e && e.stack ? e.stack : e) + "\n")
  process.exit(1)
})
