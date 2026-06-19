"use strict"

const fs = require("fs")
const path = require("path")

const BUNDLED = path.join(__dirname, "..", "data", "itemscore-api.json")
const NEED_BLOCK_VALUES = ["BOTH", "AIR", "BLOCK"]

function resolveManifestPath(explicit) {
  const candidates = [
    explicit,
    process.env.ITEMSCORE_API,
    path.resolve(process.cwd(), "plugins", "ItemsCore", "itemscore-api.json"),
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return BUNDLED
}

function loadManifest(explicit) {
  const file = resolveManifestPath(explicit)
  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  return { manifest: data, source: file, isBundled: file === BUNDLED }
}

function buildIndex(loaded) {
  const manifest = loaded.manifest
  const bindings = manifest.bindings || []
  const triggers = manifest.triggers || []
  const events = manifest.events || []
  const variables = manifest.variables || []

  const BINDING_NAMES = bindings.map((b) => b.name)
  const TRIGGER_NAMES = triggers.map((t) => t.name)

  const KNOWN_RECEIVERS = new Set()
  for (const b of bindings) KNOWN_RECEIVERS.add(b.name)
  for (const v of variables) KNOWN_RECEIVERS.add(v.name)
  for (const t of triggers) for (const v of t.variables || []) KNOWN_RECEIVERS.add(v)
  for (const e of events) for (const v of e.variables || []) KNOWN_RECEIVERS.add(v)

  return { manifest, source: loaded.source, isBundled: loaded.isBundled, bindings, triggers, events, variables, BINDING_NAMES, TRIGGER_NAMES, KNOWN_RECEIVERS }
}

function searchMethods(idx, opts) {
  opts = opts || {}
  const q = (opts.query || "").trim().toLowerCase()
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 40
  const hits = []
  for (const b of idx.bindings) {
    if (opts.binding && b.name !== opts.binding) continue
    for (const m of b.methods || []) {
      if (m.useless && !opts.includeUseless) continue
      if (q) {
        const hay = (m.name + " " + m.signature + " " + m.category + " " + m.description).toLowerCase()
        if (!hay.includes(q)) continue
      }
      hits.push(Object.assign({ binding: b.name }, m))
    }
  }
  hits.sort((a, b) => {
    if (q) {
      const an = a.name.toLowerCase() === q ? 0 : a.name.toLowerCase().startsWith(q) ? 1 : 2
      const bn = b.name.toLowerCase() === q ? 0 : b.name.toLowerCase().startsWith(q) ? 1 : 2
      if (an !== bn) return an - bn
    }
    return a.name.localeCompare(b.name)
  })
  return hits.slice(0, limit)
}

function getMethod(idx, name, binding) {
  let wantBinding = binding
  let wantName = name
  if (name.includes(".")) {
    const i = name.indexOf(".")
    wantBinding = name.slice(0, i)
    wantName = name.slice(i + 1)
  }
  const out = []
  for (const b of idx.bindings) {
    if (wantBinding && b.name !== wantBinding) continue
    for (const m of b.methods || []) {
      if (m.name === wantName) out.push(Object.assign({ binding: b.name }, m))
    }
  }
  return out
}

function validateStep(idx, step, p, errors, warnings) {
  if (typeof step !== "object" || step === null) {
    errors.push(p + " must be an object")
    return
  }
  const call = step.call
  if (typeof call !== "string" || call.length === 0) {
    errors.push(p + ".call is required and must be a string")
    return
  }
  if (call.includes(".")) {
    const receiver = call.slice(0, call.indexOf("."))
    const method = call.slice(call.indexOf(".") + 1)
    if (idx.BINDING_NAMES.includes(receiver)) {
      const found = getMethod(idx, method, receiver)
      if (found.length === 0) {
        errors.push(p + '.call "' + call + '" references unknown method "' + method + '" on binding "' + receiver + '"')
      } else if (found[0].useless) {
        warnings.push(p + '.call "' + call + '" is flagged useless (no real effect)')
      }
    } else if (!idx.KNOWN_RECEIVERS.has(receiver)) {
      warnings.push(p + '.call receiver "' + receiver + '" is not a known variable; make sure it is defined earlier or exists at runtime')
    }
  } else if (!idx.KNOWN_RECEIVERS.has(call)) {
    warnings.push(p + '.call "' + call + '" is treated as a bare variable read but is not a known variable')
  }
  if (step.args !== undefined && !Array.isArray(step.args)) errors.push(p + ".args must be an array when present")
  if (step.operatorToNext !== undefined && typeof step.operatorToNext !== "string") errors.push(p + ".operatorToNext must be a string when present")
}

function validateItem(idx, item) {
  const errors = []
  const warnings = []
  if (typeof item !== "object" || item === null) return { valid: false, errors: ["item must be a JSON object"], warnings }

  if (typeof item.name !== "string" || item.name.length === 0) errors.push("name is required and must be a non-empty string")
  if (typeof item.material !== "string" || item.material.length === 0) errors.push("material is required and must be a non-empty string (e.g. DIAMOND_SWORD)")
  if (item.needBlock !== undefined && (typeof item.needBlock !== "string" || !NEED_BLOCK_VALUES.includes(item.needBlock))) {
    errors.push("needBlock must be one of " + NEED_BLOCK_VALUES.join(", "))
  }

  if (item.actions !== undefined) {
    if (!Array.isArray(item.actions)) errors.push("actions must be an array")
    else {
      item.actions.forEach((action, ai) => {
        const ap = "actions[" + ai + "]"
        if (typeof action !== "object" || action === null) {
          errors.push(ap + " must be an object")
          return
        }
        if (typeof action.trigger !== "string" || !idx.TRIGGER_NAMES.includes(action.trigger)) {
          errors.push(ap + '.trigger "' + String(action.trigger) + '" is not a valid trigger. Valid: ' + idx.TRIGGER_NAMES.join(", "))
        }
        if (action.needBlock !== undefined && (typeof action.needBlock !== "string" || !NEED_BLOCK_VALUES.includes(action.needBlock))) {
          errors.push(ap + ".needBlock must be one of " + NEED_BLOCK_VALUES.join(", "))
        }
        if (!Array.isArray(action.steps)) errors.push(ap + ".steps must be an array")
        else action.steps.forEach((s, si) => validateStep(idx, s, ap + ".steps[" + si + "]", errors, warnings))
      })
    }
  }

  if (item.stats !== undefined && !Array.isArray(item.stats)) errors.push("stats must be an array when present")
  if (item.lore !== undefined && !Array.isArray(item.lore)) errors.push("lore must be an array of strings when present")
  if (item.enchantments !== undefined && !Array.isArray(item.enchantments)) errors.push("enchantments must be an array when present")

  return { valid: errors.length === 0, errors, warnings }
}

function itemSchema(idx) {
  return {
    description:
      "Clean item JSON consumed by the ItemsCore plugin via /ic import. The plugin converts this into both runnable code and a GUI-editable action graph, so items authored this way stay editable in-game.",
    needBlockValues: NEED_BLOCK_VALUES,
    fields: {
      name: "string (required) - internal item id, no spaces",
      fancyName: "string - display name, supports & color codes",
      id: "string - optional explicit id, defaults to name",
      material: "string (required) - Bukkit material, e.g. DIAMOND_SWORD",
      needBlock: "BOTH | AIR | BLOCK - default interaction context for the whole item",
      lore: "string[] - lore lines, support & color codes",
      enchantments: "{ name: string, level: number }[]",
      flags: "string[] - Bukkit ItemFlag names",
      talisman: "boolean - whether the item works from the inventory (talisman)",
      customModelData: "number",
      skullOwner: "string - player name for PLAYER_HEAD skins",
      stats: "object[] - stat modifiers (see editor)",
      actions: "Action[] - the behavior graph",
      events: "object[] - custom event definitions",
    },
    action: {
      trigger: "string (required) - one of: " + idx.TRIGGER_NAMES.join(", "),
      needBlock: "BOTH | AIR | BLOCK - optional per-action override",
      steps: "Step[] - executed in order, combined by operatorToNext",
    },
    step: {
      call:
        'string (required) - "core.method", "particles.method", "values.method", "api.method", a bukkit call like "player.getLocation", or a bare variable name to read it',
      args:
        'Arg[] - each arg is a JSON literal (string/number/boolean), or { var: "player" } to pass a variable, or a nested { call, args } to pass a method result',
      operatorToNext:
        "NONE | ADD | SUBTRACT | MULTIPLY | DIVIDE | EQUALS | NOT_EQUALS | GREATER_THAN | LESS_THAN | GREATER_THAN_EQUALS | LESS_THAN_EQUALS | AND | OR | END | COMMA - how this step combines with the next one (defaults to END)",
    },
    bukkitObjects:
      "player, shooter, victim, arrow, event, and any entity, block, world, location, or ItemStack returned by a method are real Bukkit/Spigot objects. You can call any standard Spigot method on them in a step (for example player.sendMessage, player.getHealth, player.getWorld, victim.setFireTicks), not only the ItemsCore methods. These are not in the method list below; see https://hub.spigotmc.org/javadocs/spigot/ for the full Spigot API. Prefer a core method when one exists.",
    bindings: idx.bindings.map((b) => ({ name: b.name, description: b.description || "", methodCount: (b.methods || []).length })),
    variables: idx.variables,
    triggers: idx.triggers,
  }
}

function generateItemTemplate(kind) {
  const k = (kind || "basic").toLowerCase()
  if (k === "ability" || k === "spell") {
    return {
      name: "magic_wand",
      fancyName: "&dMagic Wand",
      material: "BLAZE_ROD",
      needBlock: "BOTH",
      lore: ["&7Right-click to cast.", "&dExample ItemsCore item."],
      talisman: false,
      actions: [
        { trigger: "rightAction", needBlock: "BOTH", steps: [{ call: "core.broadcastMessage", args: ["A wand was cast!"], operatorToNext: "END" }] },
      ],
      events: [],
    }
  }
  return {
    name: "example_sword",
    fancyName: "&bExample Sword",
    material: "DIAMOND_SWORD",
    needBlock: "BOTH",
    lore: ["&7A starter ItemsCore item.", "&7Left-click to greet the server."],
    enchantments: [{ name: "DAMAGE_ALL", level: 1 }],
    flags: [],
    talisman: false,
    actions: [
      { trigger: "leftAction", needBlock: "BOTH", steps: [{ call: "core.broadcastMessage", args: ["Hello from my custom sword!"], operatorToNext: "END" }] },
    ],
    events: [],
  }
}

module.exports = { loadManifest, buildIndex, searchMethods, getMethod, validateItem, itemSchema, generateItemTemplate, resolveManifestPath }
