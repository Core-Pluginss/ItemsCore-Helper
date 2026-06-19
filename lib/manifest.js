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

const NUMERIC_TYPES = new Set([
  "int", "long", "double", "float", "short", "byte",
  "Integer", "Long", "Double", "Float", "Short", "Byte", "Number",
])

// Object types that cause a hard ClassCastException when mismatched (cannot be coerced at runtime).
// Mismatching any of these against each other, or against a primitive/literal, is a real bug.
const HARD_OBJECT_TYPES = new Set(["Location", "ParticleDisplay", "Vector", "World"])

// Return types of the few bukkit getters agents use constantly. Lets us catch a swap even when one
// side is a raw Spigot call (e.g. player.getLocation()) that is not in the manifest.
const BUKKIT_GETTER_RETURNS = {
  getlocation: "Location",
  geteyelocation: "Location",
  getworld: "World",
  getdirection: "Vector",
  getvelocity: "Vector",
}

// A handful of action variables whose type we know for sure.
const KNOWN_VARIABLE_TYPES = {
  landlocation: "Location",
  lastlocation: "Location",
}

function simpleType(t) {
  if (!t) return ""
  const dot = t.lastIndexOf(".")
  return dot >= 0 ? t.slice(dot + 1) : t
}

// Returns a description of what an argument produces, as { kind, type? }.
// kind is one of: "unknown", "string", "number", "boolean", "type".
function producedType(idx, arg) {
  if (arg === null) return { kind: "unknown" }
  if (typeof arg === "string") return { kind: "string" }
  if (typeof arg === "number") return { kind: "number" }
  if (typeof arg === "boolean") return { kind: "boolean" }
  if (typeof arg !== "object") return { kind: "unknown" }

  if (typeof arg.var === "string") {
    const known = KNOWN_VARIABLE_TYPES[arg.var.toLowerCase()]
    return known ? asProduced(known) : { kind: "unknown" }
  }
  if (typeof arg.call === "string") {
    const call = arg.call
    if (call.includes(".")) {
      const receiver = call.slice(0, call.indexOf("."))
      const method = call.slice(call.indexOf(".") + 1)
      if (idx.BINDING_NAMES.includes(receiver)) {
        const found = getMethod(idx, method, receiver)
        if (found.length === 1 && found[0].returns && found[0].returns !== "void") {
          return asProduced(found[0].returns)
        }
        return { kind: "unknown" }
      }
      const getter = BUKKIT_GETTER_RETURNS[method.toLowerCase()]
      return getter ? asProduced(getter) : { kind: "unknown" }
    }
    return { kind: "unknown" }
  }
  return { kind: "unknown" }
}

function asProduced(simpleName) {
  const s = simpleType(simpleName)
  if (NUMERIC_TYPES.has(s)) return { kind: "number" }
  if (s === "boolean" || s === "Boolean") return { kind: "boolean" }
  if (s === "String" || s === "CharSequence") return { kind: "string" }
  return { kind: "type", type: s }
}

// Conservative: returns true unless the arg is a definite, uncoercible mismatch.
function argCompatible(expectedRaw, produced) {
  const expected = simpleType(expectedRaw)
  if (!expected || expected === "Object") return true
  if (produced.kind === "unknown") return true

  if (expected === "String" || expected === "CharSequence") return true
  if (NUMERIC_TYPES.has(expected)) {
    if (produced.kind === "type") return NUMERIC_TYPES.has(produced.type)
    return true
  }
  if (expected === "boolean" || expected === "Boolean") {
    if (produced.kind === "type") return false
    return true
  }
  if (HARD_OBJECT_TYPES.has(expected)) {
    if (produced.kind === "type") return produced.type === expected || !HARD_OBJECT_TYPES.has(produced.type)
    return false
  }
  return true
}

function describeProduced(produced) {
  if (produced.kind === "type") return produced.type
  if (produced.kind === "string") return "string"
  if (produced.kind === "number") return "number"
  if (produced.kind === "boolean") return "boolean"
  return "value"
}

function isVarargsMethod(method) {
  if (!method.params || method.params.length === 0) return false
  const last = method.params[method.params.length - 1]
  const t = (last.type || last.jvmType || "")
  return t.includes("[]") || t.endsWith("[")
}

function validateArgs(idx, method, args, p, errors) {
  if (!method || !Array.isArray(method.params) || !Array.isArray(args)) return
  if (!isVarargsMethod(method) && args.length !== method.params.length) {
    errors.push(
      p + " calls " + method.signature + " with " + args.length + " argument(s) but it takes " + method.params.length + "."
    )
    return
  }
  for (let i = 0; i < args.length && i < method.params.length; i++) {
    const param = method.params[i]
    const expected = param.type || param.jvmType
    const produced = producedType(idx, args[i])
    if (!argCompatible(expected, produced)) {
      errors.push(
        p + '.args[' + i + '] (parameter "' + param.name + '") expects ' + simpleType(expected) +
        " but a " + describeProduced(produced) + " was passed. Check the argument order against the method signature: " + method.signature
      )
    }
  }
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
      } else {
        if (found[0].useless) {
          warnings.push(p + '.call "' + call + '" is flagged useless (no real effect)')
        }
        // Only type-check when the method is unambiguous (one overload) so we never guess wrong.
        if (found.length === 1 && Array.isArray(step.args)) {
          validateArgs(idx, found[0], step.args, p, errors)
        }
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
        if (action.cooldown !== undefined && typeof action.cooldown !== "string" && typeof action.cooldown !== "number") {
          warnings.push(ap + '.cooldown should be a duration like "5s", "1m", "1h" or a number of seconds')
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
      cooldown: 'optional - per-player reuse delay for this action. Any duration: a number plus a unit s/m/h, e.g. "5s", "45s", "2m", "90s", "1h" (a bare number means seconds). Omit or "0" for no cooldown.',
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
    projectiles:
      'For core.shootProjectile + core.createEquationVector the equation axes are relative to where the player looks: X = forward, Y = up, Z = left. A straight forward-flying projectile puts the motion on X, e.g. core.createEquationVector("t * 0.4", "0", "0"). Use Y for arc/gravity and Z to curve sideways.',
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
