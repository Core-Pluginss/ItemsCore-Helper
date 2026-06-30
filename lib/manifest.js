"use strict"

const fs = require("fs")
const path = require("path")

const BUNDLED = path.join(__dirname, "..", "data", "itemscore-api.json")
const NEED_BLOCK_VALUES = ["BOTH", "AIR", "BLOCK"]

function cmpVersion(a, b) {
  if (a == null || b == null) return 0
  const pa = String(a).split(".").map((n) => parseInt(n, 10))
  const pb = String(b).split(".").map((n) => parseInt(n, 10))
  if (isNaN(pa[0]) || isNaN(pb[0])) return 0
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

// Resolve which manifest file to use and how it was chosen. kind is one of
// "explicit" (--manifest), "env" (ITEMSCORE_API), "export" (a /ic exportapi file
// auto-found in the working dir), or "bundled".
function resolveManifestSource(explicit) {
  if (explicit && fs.existsSync(explicit)) return { path: explicit, kind: "explicit" }
  const env = process.env.ITEMSCORE_API
  if (env && fs.existsSync(env)) return { path: env, kind: "env" }
  const exp = path.resolve(process.cwd(), "plugins", "ItemsCore", "itemscore-api.json")
  if (fs.existsSync(exp)) return { path: exp, kind: "export" }
  return { path: BUNDLED, kind: "bundled" }
}

function resolveManifestPath(explicit) {
  return resolveManifestSource(explicit).path
}

function loadManifest(explicit) {
  const src = resolveManifestSource(explicit)
  let data = JSON.parse(fs.readFileSync(src.path, "utf8"))
  let source = src.path
  let isBundled = src.path === BUNDLED
  let staleExport = null

  // Guard against a stale /ic exportapi file: when an export is auto-found but its
  // plugin version is OLDER than the API the helper bundles, the server's plugin was
  // very likely updated without re-exporting. Building against the old export hides
  // newer methods and produces broken items, so fall back to the current bundled API
  // and report it. An explicit --manifest / ITEMSCORE_API choice is always honored.
  if (src.kind === "export") {
    try {
      const bundled = JSON.parse(fs.readFileSync(BUNDLED, "utf8"))
      if (cmpVersion(data.pluginVersion, bundled.pluginVersion) < 0) {
        staleExport = {
          path: src.path,
          exportVersion: String(data.pluginVersion),
          bundledVersion: String(bundled.pluginVersion),
        }
        data = bundled
        source = BUNDLED
        isBundled = true
      }
    } catch {
      /* if the bundled API cannot be read, keep the export */
    }
  }

  return { manifest: data, source, isBundled, staleExport }
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

  return { manifest, source: loaded.source, isBundled: loaded.isBundled, staleExport: loaded.staleExport || null, bindings, triggers, events, variables, BINDING_NAMES, TRIGGER_NAMES, KNOWN_RECEIVERS }
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
        const hay = (m.name + " " + m.signature + " " + m.category + " " + m.description + " " + (m.keywords || "")).toLowerCase()
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

// Walk a step's args and warn on any { var: name } (or nested call result) that reads
// a variable the manifest does not know about. A bare undefined variable compiles into a
// raw identifier and throws "<name> is not defined" at runtime (this is what produced the
// reported "trail is not defined" error). It is a warning, not an error, because an item
// may legitimately define its own variable earlier; the message names the runtime failure.
function checkArgVars(idx, arg, p, warnings) {
  if (arg === null || typeof arg !== "object") return
  if (Array.isArray(arg)) {
    arg.forEach((a, i) => checkArgVars(idx, a, p + "[" + i + "]", warnings))
    return
  }
  if (typeof arg.var === "string") {
    if (!idx.KNOWN_RECEIVERS.has(arg.var)) {
      warnings.push(
        p + ' passes variable "' + arg.var + '" which is not a known built-in variable; unless you define it in an earlier step it will throw "' + arg.var + ' is not defined" at runtime. Pass a literal value, or use { "var": "player" } / another known variable.'
      )
    }
    return
  }
  if (typeof arg.call === "string" && Array.isArray(arg.args)) {
    arg.args.forEach((a, i) => checkArgVars(idx, a, p + ".args[" + i + "]", warnings))
  }
}

// A custom item must open in the in-game /itemeditor as visual method tiles, never an opaque "script code"
// block. Two argument shapes break that and import as an un-editable tile that EMPTIES when a player clicks it:
//   1) { "expr": "<raw js>" }                       - a raw expression
//   2) a raw code STRING like "core.heal(player, 5); ..."  - a code body / statement
// This walks every argument (including nested call args and { steps } bodies) and reports either one as an
// error, with the structured replacement, so an agent never ships a code-block item. Verified offline only
// caught these via the plugin source before; this makes the public MCP catch them too.
var CODE_CALL_RE = /(^|[^A-Za-z0-9_.])(core|particles|api|item|values)\.[A-Za-z_]\w*\s*\(/
function checkNoCodeBlocks(arg, p, errors) {
  if (arg === null || arg === undefined) return
  if (typeof arg === "string") {
    if (CODE_CALL_RE.test(arg)) {
      var snip = arg.length > 48 ? arg.slice(0, 48) + "..." : arg
      errors.push(
        p + ' is a raw code string ("' + snip + '"). It imports as an un-editable "script code" tile in the ' +
        'in-game editor (it empties when a player clicks it). Use a structured body instead: ' +
        '{ "steps": [ { "call": "core.x", "args": [...] }, ... ] } for a doIf/doIfElse/loopThrough action. ' +
        'Inside a loopThrough body the current element is the variable { "var": "currentArrayObject" }.'
      )
    }
    return
  }
  if (typeof arg !== "object") return
  if (Array.isArray(arg)) { arg.forEach(function (a, i) { checkNoCodeBlocks(a, p + "[" + i + "]", errors) }); return }
  if (typeof arg.expr === "string") {
    errors.push(
      p + ' uses { "expr": "..." }, which imports as an un-editable "script code" tile in the in-game editor. ' +
      'Replace it with method calls: a condition is ONE boolean method ' +
      '(core.isAtLeast / core.isGreater / core.isWearingFullSet / core.isItemVariableAtLeast / core.isHealthBelowPercent / core.hasNearbyLiving / core.chanceOf, combined with core.and/or/not), ' +
      'a number is built from nested math (core.add/subtract/multiply/divide/min/max), ' +
      'and a list for loopThrough is core.toArray(core.getNearbyLivingEntities(...)). ' +
      'If no method exists for your check, request one be added - do not use expr.'
    )
    return
  }
  if (Array.isArray(arg.steps)) {
    arg.steps.forEach(function (s, si) {
      if (s && Array.isArray(s.args)) s.args.forEach(function (a, i) { checkNoCodeBlocks(a, p + ".steps[" + si + "].args[" + i + "]", errors) })
    })
    return
  }
  if (typeof arg.call === "string" && Array.isArray(arg.args)) {
    arg.args.forEach(function (a, i) { checkNoCodeBlocks(a, p + ".args[" + i + "]", errors) })
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
  else if (Array.isArray(step.args)) step.args.forEach((a, i) => checkArgVars(idx, a, p + ".args[" + i + "]", warnings))
  // Items must stay GUI-editable: forbid { "expr" } and raw code strings, which import as un-editable tiles.
  if (Array.isArray(step.args)) step.args.forEach((a, i) => checkNoCodeBlocks(a, p + ".args[" + i + "]", errors))
  // A structured body { "steps": [...] } (doIf/doIfElse/loopThrough action) is a nested action; validate its
  // calls too so a bad method inside a body is caught, not just top-level steps.
  if (Array.isArray(step.args)) {
    step.args.forEach((a, i) => {
      if (a && typeof a === "object" && Array.isArray(a.steps)) {
        a.steps.forEach((s, si) => validateStep(idx, s, p + ".args[" + i + "].steps[" + si + "]", errors, warnings))
      }
    })
  }
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
        if (action.cooldownMessage !== undefined && typeof action.cooldownMessage !== "string") {
          warnings.push(ap + ".cooldownMessage should be a string (the message shown while on cooldown)")
        }
        if (action.cooldownMessage !== undefined && action.cooldown === undefined) {
          warnings.push(ap + ".cooldownMessage has no effect without a cooldown set on the same action")
        }
        if (!Array.isArray(action.steps)) errors.push(ap + ".steps must be an array")
        else action.steps.forEach((s, si) => validateStep(idx, s, ap + ".steps[" + si + "]", errors, warnings))
      })
    }
  }

  if (item.events !== undefined && item.customEvents === undefined) {
    warnings.push('the custom-event field is named "customEvents", not "events"; rename it so the plugin reads it')
  }

  if (item.customEvents !== undefined) {
    if (!Array.isArray(item.customEvents)) errors.push("customEvents must be an array")
    else {
      item.customEvents.forEach((ce, ci) => {
        const cp = "customEvents[" + ci + "]"
        if (typeof ce !== "object" || ce === null) {
          errors.push(cp + " must be an object")
          return
        }
        if (typeof ce.event !== "string" || ce.event.length === 0) {
          errors.push(cp + '.event is required and must be a full Bukkit event class name, e.g. "org.bukkit.event.block.BlockBreakEvent"')
        } else if (!ce.event.includes(".")) {
          warnings.push(cp + '.event "' + ce.event + '" should be a fully-qualified class name like org.bukkit.event.block.BlockBreakEvent')
        }
        if (ce.cooldown !== undefined && typeof ce.cooldown !== "string" && typeof ce.cooldown !== "number") {
          warnings.push(cp + '.cooldown should be a duration like "5s", "1m", "1h" or a number of seconds')
        }
        if (ce.cooldownMessage !== undefined && typeof ce.cooldownMessage !== "string") {
          warnings.push(cp + ".cooldownMessage should be a string (the message shown while on cooldown)")
        }
        if (!Array.isArray(ce.steps)) errors.push(cp + ".steps must be an array")
        else ce.steps.forEach((s, si) => validateStep(idx, s, cp + ".steps[" + si + "]", errors, warnings))
      })
    }
  }

  if (item.recipe !== undefined) {
    if (!Array.isArray(item.recipe)) {
      errors.push("recipe must be an array of up to 9 slots (row-major 3x3), null for empty slots")
    } else {
      if (item.recipe.length > 9) warnings.push("recipe has more than 9 slots; only the first 9 (3x3) are used")
      item.recipe.forEach((slot, si) => {
        if (slot === null || slot === undefined) return
        if (typeof slot !== "object") {
          errors.push("recipe[" + si + "] must be an object or null")
          return
        }
        if (slot.material === undefined && slot.item === undefined) {
          errors.push("recipe[" + si + "] needs a material (vanilla) or an item (custom item name)")
        }
        if (slot.material !== undefined && slot.item !== undefined) {
          warnings.push("recipe[" + si + "] has both material and item; item takes priority")
        }
        if (slot.amount !== undefined && typeof slot.amount !== "number") {
          warnings.push("recipe[" + si + "].amount should be a number")
        }
      })
    }
  }

  if (item.stats !== undefined && !Array.isArray(item.stats)) {
    errors.push("stats must be an array when present")
  } else if (Array.isArray(item.stats)) {
    item.stats.forEach((s, i) => {
      if (typeof s !== "object" || s === null) {
        errors.push("stats[" + i + "] must be an object { stat, value }")
        return
      }
      if (typeof s.stat !== "string" || !s.stat) errors.push("stats[" + i + "].stat must be a non-empty stat name (one defined in stats.yml)")
      if (s.value !== undefined && typeof s.value !== "number") errors.push("stats[" + i + "].value must be a number")
    })
  }
  if (item.color !== undefined && (typeof item.color !== "string" || !/^#?[0-9a-fA-F]{6}$/.test(item.color))) {
    errors.push('color must be a #RRGGBB hex string (e.g. "#1ABC9C")')
  }
  if (item.type !== undefined) {
    if (typeof item.type !== "string" || !/^(normal|talisman|off_hand|armor)$/i.test(item.type.replace(/-/g, "_"))) {
      errors.push('type must be one of "normal", "talisman", "off_hand", "armor"')
    }
  }
  if (item.lore !== undefined && !Array.isArray(item.lore)) errors.push("lore must be an array of strings when present")
  if (item.enchantments !== undefined && !Array.isArray(item.enchantments)) errors.push("enchantments must be an array when present")

  if (item.attributes !== undefined) {
    if (!Array.isArray(item.attributes)) {
      errors.push("attributes must be an array of { addon, attribute, value } objects")
    } else {
      item.attributes.forEach((at, ai) => {
        const ap = "attributes[" + ai + "]"
        if (typeof at !== "object" || at === null) {
          errors.push(ap + " must be an object")
          return
        }
        const hasPair = typeof at.addon === "string" && typeof at.attribute === "string"
        const hasName = typeof at.name === "string"
        if (!hasPair && !hasName) {
          errors.push(ap + " needs either { addon, attribute } or a full { name } identifier")
        }
        if (at.value === undefined) {
          warnings.push(ap + " has no value; it will default to an empty string")
        }
      })
    }
  }

  if (item.requirements !== undefined) {
    if (!Array.isArray(item.requirements)) {
      errors.push("requirements must be an array of { type, input, operator, value } rules")
    } else {
      const REQ_TYPES = ["permission", "placeholder"]
      const REQ_OPS = [">=", "<=", ">", "<", "==", "!=", "true", "false", "equals", "notequals", "contains"]
      item.requirements.forEach((r, ri) => {
        const rp = "requirements[" + ri + "]"
        if (typeof r !== "object" || r === null) {
          errors.push(rp + " must be an object")
          return
        }
        if (typeof r.type !== "string" || !REQ_TYPES.includes(r.type.toLowerCase())) {
          errors.push(rp + '.type must be one of ' + REQ_TYPES.join(", "))
        }
        if (typeof r.input !== "string" || r.input.length === 0) {
          errors.push(rp + ".input is required (a permission node, or a placeholder like %player_level%)")
        }
        if (typeof r.type === "string" && r.type.toLowerCase() === "placeholder"
            && r.operator !== undefined && (typeof r.operator !== "string" || !REQ_OPS.includes(r.operator.toLowerCase()))) {
          warnings.push(rp + ".operator should be one of " + REQ_OPS.join(", ") + " (placeholder requirements need PlaceholderAPI installed)")
        }
      })
    }
  }
  if (item.requirementMessage !== undefined && typeof item.requirementMessage !== "string") {
    warnings.push("requirementMessage should be a string (sent, throttled, when a locked player tries to use the item)")
  }
  if (item.rarity !== undefined && typeof item.rarity !== "string") {
    errors.push("rarity must be a string (a rarity id defined via /ic rarities); render it in lore with {rarity}")
  }
  if (item.stackable !== undefined && typeof item.stackable !== "boolean") {
    warnings.push("stackable should be a boolean (true lets identical copies stack)")
  }

  return { valid: errors.length === 0, errors, warnings }
}

function itemSchema(idx) {
  return {
    description:
      "Clean item JSON consumed by the ItemsCore plugin via /ic import. The plugin converts this into both runnable code and a GUI-editable action graph, so items authored this way stay editable in-game.",
    needBlockValues: NEED_BLOCK_VALUES,
    fields: {
      name: "string (required) - internal item id, no spaces",
      fancyName: "string - display name. Supports & color codes, &#RRGGBB hex, and MiniMessage tags (<gradient>, <rainbow>, <#hex>, <bold>, ...). MiniMessage gradients/hex render in full on 1.16+ and downsample to the nearest colours on 1.8-1.15.",
      id: "string - optional explicit id, defaults to name",
      material: "string (required) - Bukkit material, e.g. DIAMOND_SWORD",
      color: 'string - leather armour dye as #RRGGBB hex (e.g. "#1ABC9C"). Applies ONLY to LEATHER_HELMET/CHESTPLATE/LEGGINGS/BOOTS; ignored on other materials. Round-trips through /ic export.',
      needBlock: "BOTH | AIR | BLOCK - default interaction context for the whole item",
      lore: "string[] - lore lines. Support & color codes, &#RRGGBB hex, MiniMessage tags, %placeholders%, {var_KEY} item variables, {stats} (expands to the stat block), {rarity} (the display text of the item's rarity), {applied_skin} (expands to one line per cosmetic skin/rune applied to the item in the Advanced Anvil; nothing when none), and {requirement:&ctext} (shown only while the holder fails the item's requirements).",
      enchantments: "{ name: string, level: number }[]",
      flags: "string[] - Bukkit ItemFlag names",
      type: 'string - where the item\'s stats and effects are active: "normal" (hand + off-hand, the default), "talisman" (passive from anywhere in the inventory), "off_hand" (only in the off-hand), or "armor" (only while worn). Setting an armor material in the editor auto-selects "armor". Prefer this over the legacy `talisman` boolean.',
      talisman: "boolean - LEGACY alias for type. true == type \"talisman\". Use the `type` field instead; this is still read for backward compatibility.",
      unbreakable: "boolean - item never loses durability (applied version-safely). Pair with the HIDE_UNBREAKABLE flag to hide the tag.",
      customModelData: "number",
      skullOwner: "string - player name for PLAYER_HEAD skins",
      skullTexture: "string - custom PLAYER_HEAD skin: a base64 texture value, a texture URL (http://textures.minecraft.net/texture/...), or a bare texture hash. Renders as a real inventory item across versions.",
      skullSignature: "string - optional Mojang signature for skullTexture (only for signed textures; usually omitted)",
      stats: 'object[] - per-item stat values, applied straight from import (no editor step needed): [{ "stat": "<stat name from stats.yml>", "value": <int> }]. The stat must already exist in stats.yml (see get_stat_schema). Render the block in lore with the {stats} placeholder.',
      actions: "Action[] - the built-in trigger behavior graph",
      customEvents: "object[] - react to ANY Bukkit event by its full class name (see customEvent)",
      recipe: "object[] - optional shaped crafting recipe, up to 9 slots row-major (3x3, top-left to bottom-right). Use null for an empty slot. See recipeSlot.",
      attributes: "object[] - addon attributes applied to this item. This is how you make an item a reforge stone, a PowerScroll, mark it unreforgeable, etc. See attribute and knownAddons.",
      requirements: "object[] - use requirements. When set, a player who fails ANY rule cannot use the item at all (no abilities, no attacking, no mining, no stats). Surface why with the {requirement:&ctext} lore placeholder, which shows only while the holder fails. See requirement.",
      requirementMessage: "string - optional message sent (throttled) to a player who tries to use the item while they do not meet its requirements.",
      rarity: 'string - the id of a rarity defined via /ic rarities (e.g. "legendary"). Shown in lore with the {rarity} placeholder, and ReforgesCore scales a reforge\'s stat and cost multipliers by the rarity. Round-trips through /ic export. Leave empty for none.',
      stackable: "boolean - if true, the item drops its unique per-item id so identical copies stack together (use for consumables and currency like vouchers, crates and coins); stackable items are skipped by dupe detection. Leave false (default) for gear that must stay unique.",
      skin: "object - makes this item a COSMETIC SKIN that is applied to other items in the Advanced Anvil (it is not worn or held itself; all of its own abilities are ignored except its interval action, used for rune particles). DYE recolors armour as leather, HEAD swaps a helmet for a textured head, RUNE only adds particles. See skin. Author normally and add this block; the item then shows up as a modifier in /advancedanvil. REQUIRES the SkinsCore addon (a separate plugin jar) - without it this block (and the {applied_skin} lore placeholder) does nothing and is ignored on import.",
    },
    requirement: {
      type: 'string (required) - "permission" or "placeholder".',
      input: 'string (required) - for type permission: the permission node, e.g. "myserver.vip". For type placeholder: a PlaceholderAPI placeholder, e.g. "%player_level%", "%vault_eco_balance%". Placeholder requirements need PlaceholderAPI installed.',
      operator: 'string - how to compare a placeholder value: ">=", "<=", ">", "<", "==", "!=" (numeric), "true"/"false" (the value is truthy/falsy), or "equals"/"notequals"/"contains" (text). Ignored for permission requirements. Defaults to "true".',
      value: 'string/number - what to compare the resolved placeholder against, e.g. 10 for %player_level% >= 10. Ignored for permission requirements and the true/false operators.',
    },
    attribute: {
      addon: 'string - the addon that owns the attribute, exactly as it appears in the in-game addon editor, e.g. "ReforgesCore", "PowerScrolls". Use together with attribute.',
      attribute: 'string - the attribute name exactly as shown in the addon editor, e.g. "Reforge stone", "Is a scroll", "Unreforgeable".',
      name: 'string - alternative to addon+attribute: the raw "<Addon>_<Attribute>" identifier (what /ic export writes). Prefer addon+attribute when authoring by hand.',
      value: 'the attribute value. A string for text attributes (e.g. the reforge name for "Reforge stone"), a boolean for toggles (e.g. true for "Is a scroll" or "Unreforgeable"), or a number where the attribute expects one.',
    },
    skin: {
      type: 'string - "dye" (recolor the target piece as leather, optional worn-only gradient), "head" (replace a helmet with a textured head, optional worn-only frame animation), or "rune" (no item change, just particles around the wearer - author them with the animation block, or the interval action as a fallback; stacks on top of one dye/head skin). Default "dye".',
      target: "object - which items this skin may be applied to. See skinTarget. Defaults to all armour. Regardless of target, a skin only applies to an Armor-type custom item (a real armour piece, or an item whose item-type is Armor); equipment, talismans, off-hand and normal items are always rejected.",
      color1: 'string - DYE only. Base leather colour as #RRGGBB hex (e.g. "#1ABC9C"). Default "#FFFFFF".',
      color2: 'string - DYE only. Optional second colour; when set, a worn piece animates a gradient between color1 and color2. Leave empty for a solid colour.',
      gradientPeriodTicks: "number - DYE only. Ticks for one full color1->color2->color1 gradient cycle while worn (min 2, default 40).",
      pieceOffsetTicks: "number - DYE only. Per-piece phase offset so a worn set flows instead of pulsing in unison (default 5).",
      frames: "object[] - HEAD only. Texture frames; with more than one the head animates between them while worn. See skinFrame.",
      prefixOverride: 'string - optional display-name prefix added before the item name (and before any reforge prefix). Defaults to the flower icon (config skins.applied-icon, default "✿").',
      prefixColorOverride: "string - optional & colour for the prefix; defaults to the item name's leading colour.",
      loreFormat: 'string - the {applied_skin} line this skin renders on the item it is applied to. Placeholders: %displayName%, %displayNameColor%, %flower_icon% (config skins.applied-icon), %type%. Default "%displayNameColor%✿ %displayName% applied" (the icon is baked in).',
      price: "number - Vault cost to apply this skin in the Advanced Anvil. Use -1 to inherit the server default (config skins.default-price).",
      animation: "object - RUNE only. A built-in orientation-aware particle animation played around the wearer (stacked shape layers with a frame clock, colours and motion). The recommended way to author runes, far richer than an interval action. See skinAnimation.",
    },
    skinTarget: {
      mode: 'string - "all_armor" (any armour piece, the default), "by_piece" (only the listed armour slots), "by_material" (only the listed materials), or "by_id" (only the listed ItemsCore item ids).',
      pieces: 'string[] - for mode by_piece: any of "HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS" (a head/skull counts as HELMET).',
      materials: 'string[] - for mode by_material: material names or family keywords, e.g. "LEATHER" matches every leather armour piece, "PLAYER_HEAD" matches heads.',
      ids: "string[] - for mode by_id: the internal names of the custom ItemsCore items this skin may be applied to.",
    },
    skinFrame: {
      texture: "string (required) - HEAD frame texture: a base64 texture value, a texture URL, or a bare hash (same forms as skullTexture).",
      signature: "string - optional Mojang signature for a signed texture (usually omitted).",
      delayTicks: "number - how long this frame is shown before advancing to the next (default 10).",
    },
    skinAnimation: {
      orientation: 'string - how the effect follows the player\'s view: "world" (fixed to the world), "yaw" (default; turns with the player but stays upright, a halo that spins with you), or "look" (tilts fully to wherever the player looks).',
      anchor: 'string - where it is centred on the wearer: "feet", "body" (default), "eyes", or "above_head".',
      speed: "number - how fast the whole animation evolves (the frame-clock rate). Default 1.0.",
      period: "number - render a frame every N ticks; higher means fewer particles and less lag. Default 1.",
      layers: "object[] - one or more stacked shape layers. See skinAnimationLayer.",
    },
    skinAnimationLayer: {
      shape: 'string - the form: circle, ring, helix, spiral, wave, polygon, star, rose, heart, infinity, lissajous, sphere, torus, cone, vortex, atom, galaxy, line, point, or equation. Default "circle".',
      particle: 'string - named particle (e.g. FLAME, SOUL_FIRE_FLAME, END_ROD), used when no colour is set. Default "FLAME".',
      color1: "string - #RRGGBB for a coloured dust; when set it overrides the particle.",
      color2: "string - second #RRGGBB; with colorMode pulse the dust fades color1<->color2.",
      colorMode: 'string - "auto" (default; picks from the colours set: none=particle, one=solid, two=pulse), "solid", "pulse", or "rainbow" (a per-point hue sweep, a real rainbow, ignoring the colours).',
      size: "number - dust size for coloured layers. Default 1.0.",
      radius: "number - overall size of the shape. Default 1.0.",
      count: "number - how many particles make up the shape. Default 24.",
      height: "number - vertical size, for shapes that use it (helix, wave, cone, torus, ...). Default 1.0.",
      p1: "number - per-shape knob 1 (e.g. turns / sides / star points / rose petals / galaxy arms / lissajous freq X - see the shape).",
      p2: "number - per-shape knob 2 (e.g. helix strands / star inner size 0-1 / torus coils / lissajous freq Y / galaxy twist).",
      p3: "number - per-shape knob 3 (lissajous freq Z).",
      spin: "number - degrees the shape rotates each frame (negative spins the other way).",
      speed: "number - this layer's own time rate, multiplied by the animation speed. Default 1.0.",
      phase: "number - starting offset around the shape, in radians.",
      offset: "number[] - [x, y, z] local offset of the layer from the anchor.",
      x: "string - equation shape only: the X (right) formula. Variables t (frame time), i (point index 0..count-1), n (count); constants pi, e; sin cos tan and + - * / ( ). Spread points evenly with i / n * 2 * pi.",
      y: "string - equation shape only: the Y (up) formula.",
      z: "string - equation shape only: the Z (forward) formula.",
    },
    knownAddons: {
      ReforgesCore: {
        "Reforge stone": 'string - set to a reforge name to turn this item into a reforge stone that applies that reforge in the Anvil (/advancedreforge) menu. The reforge must already exist (created via /reforges).',
        Unreforgeable: "boolean - true makes the item impossible to reforge in either menu.",
      },
      PowerScrolls: {
        "Is a scroll": "boolean - true turns the item into a PowerScroll, used to upgrade other items and add abilities to them.",
      },
      Equipment: {
        type: 'string - set to an equipment type id to make this item wearable equipment (e.g. "necklace", "cloak", "belt", "gloves", "bracelet"). It can then be worn in a /equipment slot that accepts that type, and contributes its stats and equip/unequip abilities ONLY while equipped (exactly like armor). The available type ids and which slots accept them are defined by the server in the EquipmentCore addon settings (settings.yml or the in-game /addons editor), so use a type id that exists there. Requires the EquipmentCore addon.',
      },
    },
    recipeSlot: {
      material: 'string - a vanilla Bukkit material for this slot, e.g. "DIAMOND". Use this OR item.',
      item: "string - the name of another custom ItemsCore item to require in this slot (instead of material).",
      amount: "number - how many are required in this slot (default 1). Crafting consumes exactly this many, so amount > 1 is supported.",
    },
    customEvent: {
      event:
        'string (required) - the FULL Bukkit event class name, e.g. "org.bukkit.event.block.BlockBreakEvent", "org.bukkit.event.entity.EntityDeathEvent". The plugin checks it exists on import.',
      cooldown: "optional - per-player reuse delay, same format as an action cooldown",
      cooldownMessage:
        'optional - message sent to the player when this event handler is blocked by its cooldown. Supports & color codes and the same remaining-time placeholders as an action cooldownMessage.',
      steps:
        "Step[] - same step format as an action. Variables available: player (the player from the event), item, event (the fired Bukkit event), plus core/particles/values/api.",
    },
    action: {
      trigger: "string (required) - one of: " + idx.TRIGGER_NAMES.join(", "),
      needBlock: "BOTH | AIR | BLOCK - optional per-action override",
      cooldown: 'optional - per-player reuse delay for this action. Any duration: a number plus a unit s/m/h, e.g. "5s", "45s", "2m", "90s", "1h" (a bare number means seconds). Omit or "0" for no cooldown.',
      cooldownMessage:
        'optional - message sent to the player when they trigger this action while it is still on cooldown. Supports & color codes and these placeholders for the time left: %remaining_seconds%, %remaining_minutes%, %remaining_hours% (each the whole remaining time in that unit, rounded up), %remaining% (formatted like "1m 30s"), %remaining_millis%. Only does anything when a cooldown is also set.',
      steps: "Step[] - executed in order, combined by operatorToNext",
    },
    step: {
      call:
        'string (required) - "core.method", "particles.method", "values.method", "api.method", a bukkit call like "player.getLocation", or a bare variable name to read it',
      args:
        'Arg[] - each arg is a JSON literal (string/number/boolean), or { var: "player" } to pass a variable, or a nested { call, args } to pass a method result, or a structured body { steps: [...] } for an action/condition body (see editableRule).',
      operatorToNext:
        "NONE | ADD | SUBTRACT | MULTIPLY | DIVIDE | EQUALS | NOT_EQUALS | GREATER_THAN | LESS_THAN | GREATER_THAN_EQUALS | LESS_THAN_EQUALS | AND | OR | END | COMMA - how this step combines with the next one (defaults to END)",
    },
    editableRule:
      'CRITICAL - every item must open in the in-game /itemeditor as visual method tiles, never an opaque "script code" block (a code block empties when a player clicks it). So NEVER use { "expr": "<raw js>" } and NEVER pass a raw code string like "core.heal(player, 5); ..." as an argument. validate_item rejects both. Instead: (1) a CONDITION (the first arg of core.doIf / core.doIfElse) is ONE boolean method - core.isAtLeast/isGreater/isLess/isAtMost/isEqual(a,b), core.isWearingFullSet(player,"prefix"), core.isItemVariableAtLeast(player,key,n), core.isHealthBelowPercent(player,0.3), core.isStandingStill(player), core.hasNearbyLiving(player,x,y,z), core.chanceOf(pct), combined with core.and/or/not(...); (2) a BODY (the action / elseAction of doIf/doIfElse, and the action of core.loopThrough) is a structured { "steps": [ { "call", "args" }, ... ] } object - inside a loopThrough body the current element is { "var": "currentArrayObject" }; (3) a NUMBER is built from nested math - core.add/subtract/multiply/divide/min/max/clamp, e.g. core.add(8, core.multiply(core.min(souls,10), 6)); (4) a LIST for loopThrough is core.toArray(core.getNearbyLivingEntities(player,x,y,z)). If you need a check with no matching method, request the method be added rather than using expr.',
    animations:
      'For cool ability effects, prefer a named particle animation over a long chain of raw particles.* calls. Build the animation in the in-game /ic animations menu (or ship plugins/ItemsCore/animations/<name>.yml), then fire it from a step with one editable call: particles.playAnimation(player, "name", ticks) on the player, or particles.playAnimationAt(location, "name", ticks) at a location (e.g. { "call": "victim.getLocation", "args": [] }).',
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
      type: "normal",
      actions: [
        { trigger: "rightAction", needBlock: "BOTH", steps: [{ call: "core.broadcastMessage", args: ["A wand was cast!"], operatorToNext: "END" }] },
      ],
      customEvents: [],
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
    type: "normal",
    actions: [
      { trigger: "leftAction", needBlock: "BOTH", steps: [{ call: "core.broadcastMessage", args: ["Hello from my custom sword!"], operatorToNext: "END" }] },
    ],
    customEvents: [],
  }
}

const STAT_SCHEMA = {
  description:
    "Stats are named numeric values shown on items (Strength, Crit Chance, Mana, etc.). A stat is defined ONCE globally in plugins/ItemsCore/stats/stats.yml, then attached to items with a per-item value. Unlike items, a stat is a simple flat object and is safe to hand-author or edit directly in stats.yml. After editing the file, run /ic reload stats to apply it (no server restart).",
  file: "plugins/ItemsCore/stats/stats.yml",
  format:
    "A YAML list under a top-level 'stats:' key. Each entry MUST begin with the exact serialization marker line '==: me.tastycake.itemscore.item.stats.Stat' (this is the fully-qualified class name and is required, the file will not load without it).",
  fields: {
    name: "string (required) - internal id used by items and the {stats} placeholder. No spaces, e.g. strength.",
    fancyName: "string (required) - the label shown in item lore, supports & color codes, e.g. '&cStrength'.",
    fancyValue: "string (required) - the value format. Put %value% where the number goes, e.g. '&c+%value%', or '&9%value%%' for a percent.",
    baseValue: "integer - the default value when an item does not override it (default 100).",
  },
  example:
    "stats:\n- ==: me.tastycake.itemscore.item.stats.Stat\n  name: strength\n  fancyName: '&cStrength'\n  fancyValue: '&c+%value%'\n  baseValue: 10\n- ==: me.tastycake.itemscore.item.stats.Stat\n  name: crit_chance\n  fancyName: '&9Crit Chance'\n  fancyValue: '&9%value%%'\n  baseValue: 5\n",
  howToApply:
    "Edit (or create) plugins/ItemsCore/stats/stats.yml, then run /ic reload stats (or /ic reload stats <name> for a single stat). You can also create and edit stats in-game with /stats.",
  attachingToItems:
    "An item references a stat by its name; set the per-item value either in clean .import JSON via the item's stats array ([{ \"stat\": \"strength\", \"value\": 50 }]) or in-game in the editor (/itemeditor <item> -> Stats). Item lore renders each active stat as fancyName + ' ' + fancyValue, with %value% replaced by the effective value (base + per-item + reforge bonuses). The {stats} placeholder renders the whole stat block live.",
}

function statSchema() {
  return STAT_SCHEMA
}

function validateStat(stat) {
  const errors = []
  const warnings = []
  if (typeof stat !== "object" || stat === null) {
    return { valid: false, errors: ["stat must be a JSON object with name, fancyName and fancyValue"], warnings }
  }
  if (typeof stat.name !== "string" || stat.name.length === 0) {
    errors.push("name is required and must be a non-empty string (no spaces, e.g. strength)")
  } else if (/\s/.test(stat.name)) {
    warnings.push("name should not contain spaces; use underscores, e.g. crit_chance")
  }
  if (typeof stat.fancyName !== "string" || stat.fancyName.length === 0) {
    errors.push("fancyName is required (the lore label, e.g. '&cStrength')")
  }
  if (typeof stat.fancyValue !== "string" || stat.fancyValue.length === 0) {
    errors.push("fancyValue is required (the value format, e.g. '&c+%value%')")
  } else if (!stat.fancyValue.includes("%value%")) {
    warnings.push("fancyValue usually contains %value% so the number is shown, e.g. '&c+%value%'")
  }
  if (stat.baseValue !== undefined && typeof stat.baseValue !== "number") {
    warnings.push("baseValue should be a whole number (it defaults to 100)")
  }
  return { valid: errors.length === 0, errors, warnings }
}

const COMMANDS = [
  { command: "/ic", usage: "/ic", description: "Open the ItemsCore admin hub: browse/create/edit/give items, set recipes, and reach rarities, damage indicators, addons, updates and more.", permission: "itemscore.admingui", aliases: ["/itemscore"] },
  { command: "/ic editor", usage: "/ic editor [item|none]", description: "Open the visual item editor, optionally for an existing item. Same as /itemeditor.", permission: "itemscore.admingui" },
  { command: "/ic reload", usage: "/ic reload [items|stats|rarities] [name]", description: "Reload from disk. No arguments reloads everything. A category (items, stats or rarities) reloads all of that category. Adding a name after the category reloads just that one item or stat. Backward compatible: /ic reload <itemName> still reloads a single item.", permission: "itemscore.admingui" },
  { command: "/ic rarities", usage: "/ic rarities", description: "Manage item rarities: display text, order, and the stat & cost multipliers ReforgesCore applies. Items reference a rarity by id and show it in lore with {rarity}. Alias /ic rarity.", permission: "itemscore.admingui" },
  { command: "/ic indicators", usage: "/ic indicators", description: "Configure the floating damage and heal indicator holograms (enable, number format, vertical offset). Alias /ic indicator.", permission: "itemscore.admingui" },
  { command: "/ic cosmetics", usage: "/ic cosmetics", description: "Toggle blocking of vanilla cosmetic edits (leather dyeing, cauldron washing, armor trims, banner/firework/shield combining) on custom ItemsCore items only; plain vanilla items stay editable. All off by default. Alias /ic cosmetic.", permission: "itemscore.admingui" },
  { command: "/ic dupe", usage: "/ic dupe", description: "Configure duplicate-item detection: enable/disable, auto-delete or wipe duped items, scan interval, per-player alert cooldown and ender chest scanning. Staff with itemscore.dupeflags get clickable alerts (/toggledupealerts to mute; itemscore.avoiddupe exempts a player). Alias /ic dupedetection.", permission: "itemscore.admingui" },
  { command: "/ic updates", usage: "/ic updates", description: "Open the addon updates menu: check for and apply updates to installed ItemsCore addons. Alias /ic update.", permission: "itemscore.admingui" },
  { command: "/ic import", usage: "/ic import <file>", description: "Import a clean item JSON from plugins/ItemsCore/imports/. The item becomes live and GUI-editable. Importing over an existing name overwrites that item and keeps its stats, recipe and attributes.", permission: "itemscore.admingui" },
  { command: "/ic export", usage: "/ic export <item>", description: "Write an existing item to plugins/ItemsCore/exports/<item>.import as clean JSON you can edit and re-import.", permission: "itemscore.admingui" },
  { command: "/ic adopt", usage: "/ic adopt <item>", description: "Convert a legacy code-only item into GUI-editable actions so it can be edited and exported.", permission: "itemscore.admingui" },
  { command: "/ic delete", usage: "/ic delete <item> confirm", description: "Permanently delete an item and its file.", permission: "itemscore.admingui" },
  { command: "/ic give", usage: "/ic give <player> <item> [amount]", description: "Give a custom item to a player from the console or in-game. Online players get it immediately; offline players have it queued and delivered on their next join. [amount] defaults to 1 (max 2304); for a non-stackable item each copy is generated with its own unique instance id. The receiver gets no message - only the sender is confirmed.", permission: "itemscore.admingui" },
  { command: "/ic install", usage: "/ic install <item|template|stat|addon> <url|name>", description: "Download an item, template or stat from a direct URL, or install/browse supported addons (/ic install addon browse).", permission: "itemscore.admingui" },
  { command: "/ic templates", usage: "/ic templates", description: "Manage saved action templates (rename, delete).", permission: "itemscore.admingui" },
  { command: "/ic animations", usage: "/ic animations", description: "Build named particle animations entirely in the GUI (categorized shape picker, stacked layers, colors and a live test), then play any of them from an item action with particles.playAnimation(player, \"name\", ticks) - no code needed. Saved to plugins/ItemsCore/animations/.", permission: "itemscore.admingui" },
  { command: "/ic exportapi", usage: "/ic exportapi", description: "Regenerate plugins/ItemsCore/itemscore-api.json, the scripting API manifest the AI tools read.", permission: "itemscore.admingui" },
  { command: "/ic database", usage: "/ic database [status|migrate|restore]", description: "Multi-server database sync (MongoDB + Redis): show status, or migrate files <-> database.", permission: "itemscore.admingui" },
  { command: "/ic libraries", usage: "/ic libraries [status|verify]", description: "Status and download of the optional multi-server sync drivers.", permission: "itemscore.admingui" },
  { command: "/ic reforges", usage: "/ic reforges", description: "Open the ReforgesCore reforge manager. Only available when the ReforgesCore addon is installed. Same as /reforges.", permission: "itemscore.admingui" },
  { command: "/ic wardrobe", usage: "/ic wardrobe", description: "Open the WardrobeCore management menu. Only available when the WardrobeCore addon is installed.", permission: "itemscore.admingui" },
  { command: "/ic equipment", usage: "/ic equipment", description: "Open the EquipmentCore admin menu: settings, equipment types, slots, custom items/buttons, and the menu layout editor. Only available when the EquipmentCore addon is installed.", permission: "itemscore.admingui" },
  { command: "/ic profile", usage: "/ic profile", description: "Open the ProfileCore admin menu: enable/disable, menu title, rows, filler, live-refresh rate, right-click toggle, the profile head (name + placeholder lore), the layout (armor/held/off-hand/injection slots) and custom buttons. Only available when the ProfileCore addon is installed.", permission: "itemscore.admingui" },
  { command: "/itemeditor", usage: "/itemeditor <item|none>", description: "Open the visual item editor for an item, or a blank one. Same as /ic editor.", permission: "itemscore.itemeditor" },
  { command: "/stats", usage: "/stats", description: "Open the stats manager GUI to create, edit and delete stats. Stats can also be edited directly in stats/stats.yml then applied with /ic reload stats.", permission: "itemscore.stats" },
  { command: "/addons", usage: "/addons", description: "Open the addons menu: settings and management for installed ItemsCore addons.", permission: "itemscore.addons" },
  { command: "/playerinventory", usage: "/playerinventory <player>", description: "Inspect and give items from an online player's inventory. Also available as /ic pinv <player>.", permission: "itemscore.playerinventory" },
  { command: "/toggledupealerts", usage: "/toggledupealerts", description: "Toggle duplicate-item alert messages for yourself. Alias /tda.", permission: "itemscore.toggledupealerts", aliases: ["/tda"] },
  { command: "/advancedanvil", usage: "/advancedanvil [player]", description: "Open the Advanced Anvil station: rename, combine, and apply pluggable modules such as reforge stones (ReforgesCore registers its reforge module here). Alias /aanvil.", permission: "itemscore.advancedanvil.self", aliases: ["/aanvil"] },
  { command: "/recipe", usage: "/recipe [search]", description: "Player recipe book: browse the crafting recipes of custom items. An optional search filters by name; click an ingredient to open its own recipe, with back navigation. Available to everyone by default (itemscore.recipe, default true).", permission: "itemscore.recipe" },
]

const ADDON_COMMANDS = [
  { command: "/reforges", usage: "/reforges", description: "ReforgesCore addon: manage reforges (create, edit stats, set prices). Also openable from /ic reforges.", requires: "ReforgesCore addon" },
  { command: "/advancedreforge", usage: "/advancedreforge", description: "ReforgesCore addon: open the targeted reforge (Anvil) menu where reforge stones are applied.", requires: "ReforgesCore addon" },
  { command: "/reforge", usage: "/reforge", description: "ReforgesCore addon: open the random-reforge menu.", requires: "ReforgesCore addon" },
  { command: "/wardrobe", usage: "/wardrobe [player]", description: "WardrobeCore addon: open the wardrobe to save and toggle full armor sets. Also openable from /ic wardrobe (management). Default permission: everyone.", requires: "WardrobeCore addon" },
  { command: "/equipment", usage: "/equipment [player]", description: "EquipmentCore addon: open the equipment menu of extra wearable slots (and the real armor slots) that work like armor while equipped. Click a slot to unequip it to your inventory; click a piece in your inventory to equip it. Aliases /eq, /equip. Default permission: everyone. Configure slots and types in the /addons editor or EquipmentCore settings.yml.", requires: "EquipmentCore addon" },
  { command: "/profile", usage: "/profile [player]", description: "ProfileCore addon: open a player's profile - their equipped armor, equipment (injected by EquipmentCore), held item, off-hand on supported versions, and a live player head with their name and stats ({stats}, {stat_<name>} and PlaceholderAPI placeholders). Right-click a player to open theirs, or use the command for yourself or another player. Alias /prof. Permissions: profilecore.use (right-click, default everyone), profilecore.command (the command, default everyone - set false to disable). Fully configurable via /ic profile or /addons.", requires: "ProfileCore addon" },
]

function commandList() {
  return {
    description:
      "Every in-game command of the ItemsCore plugin. Use this to help the user run the plugin: import/export/reload items, manage stats, open editors, install addons, and more. All /ic subcommands also accept /itemscore. Most need the itemscore.admingui permission (server operators have it by default).",
    commands: COMMANDS,
    addonCommands: ADDON_COMMANDS,
    notes: [
      "Build an item: save a clean JSON as <name>.import in plugins/ItemsCore/imports/, then /ic import <name>.",
      "Edit a stat: edit plugins/ItemsCore/stats/stats.yml (see get_stat_schema), then /ic reload stats.",
      "addonCommands only work when that addon plugin is installed.",
    ],
  }
}

module.exports = { loadManifest, buildIndex, searchMethods, getMethod, validateItem, itemSchema, generateItemTemplate, resolveManifestPath, resolveManifestSource, cmpVersion, statSchema, validateStat, STAT_SCHEMA, commandList, COMMANDS }
