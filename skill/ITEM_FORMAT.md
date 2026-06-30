# ItemsCore clean item JSON reference

This is the offline reference for the item format ItemsCore imports. When the live API is reachable, prefer it (`get_item_schema`, `search_methods`, `get_method`), because it reflects the exact methods on the user's server. Use this file when offline.

## Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string, required | Internal id, no spaces (e.g. `flame_sword`) |
| `fancyName` | string | Display name. Supports `&` color codes, `&#RRGGBB` hex, and MiniMessage tags (`<gradient>`, `<rainbow>`, `<#hex>`, `<bold>`, ...). MiniMessage gradients/hex render in full on 1.16+ and downsample to the nearest colours on 1.8-1.15 |
| `id` | string | Optional explicit id; defaults to `name` |
| `material` | string, required | Bukkit material (e.g. `DIAMOND_SWORD`, `BLAZE_ROD`, `PLAYER_HEAD`) |
| `color` | string | Leather armour dye as `#RRGGBB` hex (e.g. `#1ABC9C`). Applies **only** to `LEATHER_HELMET`/`CHESTPLATE`/`LEGGINGS`/`BOOTS`; ignored on other materials. Round-trips through `/ic export` |
| `needBlock` | `BOTH` \| `AIR` \| `BLOCK` | Default interaction context for the item |
| `lore` | string[] | Lore lines. Support `&` color codes, `&#RRGGBB` hex, MiniMessage tags, `%placeholders%`, `{var_KEY}` item variables, `{stats}`, `{rarity}` (the item's rarity display text), `{applied_skin}` (one line per cosmetic skin/rune applied in the Advanced Anvil; nothing when none; provided by the SkinsCore addon), and `{requirement:&ctext}` (shows only while the holder fails the item's requirements) |
| `enchantments` | `{ name, level }[]` | e.g. `{ "name": "DAMAGE_ALL", "level": 3 }` |
| `flags` | string[] | Bukkit ItemFlag names (e.g. `HIDE_ATTRIBUTES`) |
| `type` | `normal` \| `talisman` \| `off_hand` \| `armor` | Where the item's stats and effects are active. `normal` (default) = main hand **and** off-hand; `talisman` = passively from anywhere in the inventory; `off_hand` = only while held in the off-hand; `armor` = only while worn. In the editor, setting an armor material auto-selects `armor`. Prefer this over the legacy `talisman` boolean |
| `talisman` | boolean | LEGACY alias for `type`. `true` == `type: "talisman"`. Still read for backward compatibility; use `type` instead |
| `stackable` | boolean | If true, the item drops its unique per-item id so identical copies stack together. Use it for consumables and currency like vouchers, crates and coins. Leave it `false` (default) for gear that must stay unique. Stackable items are skipped by dupe detection |
| `customModelData` | number | Resource-pack model id |
| `unbreakable` | boolean | If true, the item never loses durability (applied version-safely). Pair with the `HIDE_UNBREAKABLE` flag to hide the tag |
| `skullOwner` | string | Player name, for `PLAYER_HEAD` skins |
| `skullTexture` | string | Custom skin for a `PLAYER_HEAD`: a base64 texture value, a texture URL (`http://textures.minecraft.net/texture/...`), or a bare texture hash. Renders as a real inventory item across versions. Leave empty for none |
| `skullSignature` | string | Optional Mojang signature for `skullTexture` (only needed for signed textures; usually omitted) |
| `stats` | object[] | Per-item stat values, applied straight from import: `[{ "stat": "<name from stats.yml>", "value": <int> }]`. The stat must already exist in `stats.yml` (see `get_stat_schema`). Render the block in lore with `{stats}` |
| `actions` | Action[] | The built-in trigger behavior graph (see below) |
| `customEvents` | object[] | React to ANY Bukkit event by its full class name (see Custom events) |
| `recipe` | object[] | Optional shaped crafting recipe, up to 9 slots row-major (3x3). `null` for empty slots. Each slot is `{ "material": "DIAMOND", "amount": 1 }` (vanilla) or `{ "item": "custom_item_name", "amount": 1 }` (another custom item). `amount` defaults to 1 and is how many are consumed from that slot, so `amount > 1` is supported. Example: `[{"material":"DIAMOND"},null,null,{"material":"DIAMOND"},null,null,{"material":"STICK"},null,null]` |
| `attributes` | object[] | Addon attributes applied to the item (reforge stones, PowerScrolls, etc.). Each entry is `{ "addon", "attribute", "value" }`. See Addon attributes |
| `requirements` | object[] | Use requirements. When set, a player who fails ANY rule cannot use the item at all (no abilities, no attacking, no mining, no stats). See Item requirements |
| `requirementMessage` | string | Optional message sent (throttled) when a locked player tries to use the item |
| `rarity` | string | The id of a rarity defined via `/ic rarities` (e.g. `legendary`). Shown in lore with the `{rarity}` placeholder, and for ReforgesCore it scales a reforge's stat and cost multipliers. Round-trips through `/ic export`. Leave empty for none. See Item rarity |
| `skin` | object | Makes this item a **cosmetic skin** applied to other items in the Advanced Anvil (not worn/held itself; only its `intervalAction` runs, for rune particles). `dye` recolors armour as leather, `head` swaps a helmet for a textured head, `rune` only adds particles. See Skins. **Requires the SkinsCore addon** (the block is ignored on import if it is not installed) |

## Worked example: leather armour with colour and stats

A dyed leather chestplate that grants stats. `color` dyes the leather, each `stats` entry references a stat already defined in `stats.yml` (check with `get_stat_schema`), and `{stats}` renders the block in lore. No in-game editor step is needed.

```json
{
  "name": "ranger_chestplate",
  "fancyName": "&2Ranger's Tunic",
  "material": "LEATHER_CHESTPLATE",
  "color": "#2E8B57",
  "lore": [
    "&7A woven tunic of the deep wood.",
    "",
    "{stats}"
  ],
  "stats": [
    { "stat": "health", "value": 40 },
    { "stat": "defense", "value": 25 }
  ]
}
```

Build the other three pieces the same way (`LEATHER_HELMET` / `LEATHER_LEGGINGS` / `LEATHER_BOOTS`) with the same `color` for a matching set. Save each as its own `.import` file and run `/ic import <name>`.

## Addon attributes

Some behavior comes from ItemsCore **addons** (separate plugins) that attach **attributes** to an item. Set them with the `attributes` array. Each entry uses the exact addon and attribute names shown in the in-game addon editor:

```json
"attributes": [
  { "addon": "ReforgesCore", "attribute": "Reforge stone", "value": "sharp" }
]
```

| `addon` | string | The addon that owns the attribute, e.g. `ReforgesCore`, `PowerScrolls` |
| `attribute` | string | The attribute name exactly as in the addon editor, e.g. `Reforge stone`, `Is a scroll`, `Unreforgeable` |
| `value` | string \| boolean \| number | String for text attributes, `true`/`false` for toggles |

You can also use `{ "name": "ReforgesCore_Reforge stone", "value": "sharp" }` (the raw `Addon_Attribute` id that `/ic export` writes), but prefer the `addon` + `attribute` pair.

Known addon attributes:

| Addon | Attribute | Value | Effect |
|---|---|---|---|
| `ReforgesCore` | `Reforge stone` | reforge name (string) | Turns the item into a stone that applies that reforge in the Anvil (`/advancedreforge`) menu. The reforge must already exist (`/reforges`) |
| `ReforgesCore` | `Unreforgeable` | `true` | Item can never be reforged |
| `PowerScrolls` | `Is a scroll` | `true` | Turns the item into a PowerScroll used to upgrade other items |
| `Equipment` | `type` | type id (string) | Makes the item wearable equipment of that type (e.g. `necklace`, `cloak`, `belt`, `gloves`, `bracelet`). Worn in the `/equipment` menu in a slot that accepts the type; contributes its stats and equip/unequip abilities only while equipped (like armour). Pair with `type: "armor"`. Requires the EquipmentCore addon |

Re-importing over an existing item **merges** attributes: it overwrites the one you name and keeps the others. Only the named addon needs to be installed for its attribute to take effect.

## Action

```json
{ "trigger": "rightAction", "needBlock": "BOTH", "steps": [ ... ] }
```

| Field | Type | Notes |
|---|---|---|
| `trigger` | string, required | One of the triggers below |
| `needBlock` | `BOTH` \| `AIR` \| `BLOCK` | Optional per-action override of the item default |
| `cooldown` | duration string | Optional reuse delay, PER ITEM (two of the same item have independent cooldowns). This is the LOGIC GATE only: it blocks the action from running again and sends the `cooldownMessage`. It does NOT grey the item out by itself (an item can have several actions with different cooldowns, so auto-greying would be ambiguous). To show the vanilla grey-out / sweep, call `core.setItemCooldown(player, seconds)` inside the action. Any duration: a number plus a unit s/m/h, e.g. `"5s"`, `"45s"`, `"2m"`, `"90s"`, `"1h"` (a bare number means seconds) |
| `cooldownMessage` | string | Optional message sent when the player triggers this action while on cooldown. Supports `&` colors and placeholders `%remaining_seconds%`, `%remaining_minutes%`, `%remaining_hours%` (whole time left in that unit, rounded up), `%remaining%` (formatted like `1m 30s`), `%remaining_millis%`. Needs `cooldown` set to do anything |
| `steps` | Step[] | Run in order, combined by each step's `operatorToNext` |

### Triggers

| Trigger | Fires when | Variables available |
|---|---|---|
| `leftAction` | Left-click holding the item (this is the attack swing) | player, item, event |
| `leftSAction` | Sneak + left-click | player, item, event |
| `rightAction` | Right-click holding the item | player, item, event |
| `rightSAction` | Sneak + right-click | player, item, event |
| `shiftAction` | Starts sneaking while holding or wearing it | player, item, event |
| `dropAction` | Drops the item (the drop is cancelled) | player, item, event |
| `swapAction` | Swaps hands (F) with the item | player, item, event |
| `shootAction` | Shoots a projectile while holding it | shooter, item, event |
| `pickupAction` | Picks up the item | player, item, event |
| `arrowLandAction` | An arrow shot while holding it lands | shooter, item, arrow, landLocation, event |
| `armorEquipEvent` | The item (armor) is equipped | player, item, event |
| `armorUnEquipEvent` | The item (armor) is unequipped | player, item, event |
| `playerMoveEvent` | Moves while holding or wearing it | player, item, event |
| `playerDamageEvent` | The holder/wearer takes damage | player, item, event |
| `damageEvent` | The holder DEALS damage to something with the item (best "on hit" trigger for weapons) | attacker, victim, item, cause, damage, event |
| `intervalAction` | Repeats automatically on a timer while the item is held or worn (see below) | player, item, event |
| `projectileHitEntityEvent` | A custom projectile from this item hits an entity | shooter, victim, item, lastLocation, event |
| `projectileHitBlockEvent` | A custom projectile from this item hits a block | shooter, item, lastLocation, event |

Note: `leftAction` fires on left-click of AIR or a block, NOT when you hit a mob (hitting a mob is `damageEvent`, with `attacker`/`victim`). Left-click-air is also unreliable in Minecraft, so for "when the player attacks" use `damageEvent`.

### Interval / repeating actions

An `intervalAction` runs over and over on a timer for as long as the item is held or worn. Add an `interval` field (in ticks, 20 = 1 second). Use it for auras (repeating particles), passive effects you keep topped up, or anything that should tick while equipped. Because it stops the moment the item is unequipped, a short re-applied potion effect becomes an "effect while held/worn".

```json
{
  "trigger": "intervalAction",
  "interval": 20,
  "steps": [
    { "call": "core.giveEffect", "args": [ { "var": "player" }, "NIGHT_VISION", 60, 0, true, false ], "operatorToNext": "END" },
    { "call": "core.createParticleByLocation", "args": [ { "call": "core.addToLocation", "args": [ { "call": "player.getLocation", "args": [] }, 0, 2.3, 0 ] }, { "call": "particles.colored", "args": [255, 224, 138, 1] }, 0, 5, 1 ], "operatorToNext": "END" }
  ]
}
```

## Step

```json
{ "call": "core.heal", "args": [ { "var": "player" }, 6 ], "operatorToNext": "END" }
```

| Field | Type | Notes |
|---|---|---|
| `call` | string, required | `core.method`, `particles.method`, `values.method`, `api.method`, a Bukkit call like `player.getLocation`, or a bare variable name to read it |
| `args` | Arg[] | The call arguments, in order |
| `operatorToNext` | string | How this step joins the next one (default `END`) |

### Arg forms

- A JSON literal: `"hello"`, `6`, `1.5`, `true`.
- A variable: `{ "var": "player" }` passes the `player` object.
- A nested call: `{ "call": "player.getLocation", "args": [] }` passes one call's result into another.

Example, passing results into a call:

```json
{ "call": "core.playSound", "args": [
  { "var": "player" },
  { "call": "player.getLocation", "args": [] },
  { "call": "core.getSound", "args": ["ENTITY_BLAZE_SHOOT"] },
  1, 1
] }
```

### Operators (`operatorToNext`)

| Operator | Meaning |
|---|---|
| `END` | End the statement (most common; use between independent steps) |
| `NONE` | No joining token |
| `ADD` `SUBTRACT` `MULTIPLY` `DIVIDE` | Arithmetic `+ - * /` between values |
| `EQUALS` `NOT_EQUALS` | `===` `!==` |
| `GREATER_THAN` `LESS_THAN` `GREATER_THAN_EQUALS` `LESS_THAN_EQUALS` | `>` `<` `>=` `<=` |
| `AND` `OR` | `&&` `\|\|` |
| `COMMA` | `,` separate values |

For most items, every step uses `END`. Operators other than `END` build a single expression across steps (for conditions and math). When you need a condition, prefer `core.doIf` / `core.doIfElse` / `core.chanceOf` rather than chaining raw operators.

## Variables

| Variable | When |
|---|---|
| `core` `particles` `values` `api` | Always available (the scripting bindings) |
| `item` | Always (the custom item this action belongs to) |
| `event` | Always (the Bukkit event; cancel it with `core.cancelEvent(event)`) |
| `player` | Most triggers |
| `shooter` | shootAction, arrowLandAction, projectile hit events |
| `victim` | projectileHitEntityEvent |
| `arrow` | arrowLandAction |
| `landLocation` | arrowLandAction |
| `lastLocation` | projectile hit events |

## Custom events

`actions` only cover the built-in triggers above. To react to ANY other Bukkit event, add a `customEvents` entry with the event's full class name. The plugin checks the class exists on import and blocks the import if it does not.

```json
"customEvents": [
  {
    "event": "org.bukkit.event.block.BlockBreakEvent",
    "steps": [
      { "call": "core.sendColorMessage", "args": [ { "var": "player" }, "&aYou broke a block while holding this!" ], "operatorToNext": "END" }
    ]
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `event` | string, required | The FULL Bukkit event class, e.g. `org.bukkit.event.block.BlockBreakEvent`, `org.bukkit.event.entity.EntityDeathEvent`, `org.bukkit.event.player.PlayerInteractEvent` |
| `cooldown` | duration string | Optional, same format as an action cooldown |
| `cooldownMessage` | string | Optional, same as an action `cooldownMessage` (sent when the cooldown blocks the handler) |
| `steps` | Step[] | Same step format as an action (below) |

Variables in a custom event step: `player` (the player the plugin finds on the event), `item`, `event` (the fired event itself - read its data with calls like `{ "call": "event.getBlock", "args": [] }`), plus `core` / `particles` / `values` / `api`. A custom event only fires while the player has the item (held, worn, or anywhere in the inventory for talismans). Use the exact class name; do not guess the package.

## Item variables and dynamic lore

An item can store its own values that travel with that exact item, even when it is moved, dropped or traded. Use them for per item state like an upgrade level, a kill counter or charges left. This is how you build upgradable items and live updating lore.

- `core.setItemVariable(player, "level", 1)` stores a value on the held item.
- `core.getItemVariable(player, "level")` / `core.getItemVariableOrDefault(player, "level", 1)` read it back.
- `core.addItemVariable(player, "kills", 1)` adds to a number (counting from 0) and returns the new total; `core.subtractItemVariable(player, "souls", 10)` spends from it.
- `core.getItemVariableNumber(player, "souls")` reads a variable as a number (0 if unset) so you can do math with it.
- Write `{var_yourKey}` anywhere in the item's `lore` and it shows that variable (a missing value shows `0`).
- After changing a variable, call `core.refreshItemLore(player)` to redraw the held item's lore so the new value appears live.

**Build abilities as nested calls, not code strings.** Prefer the structured `call` form so the ability stays fully editable in the in-game item editor. Do the math with the generic helpers - `core.min`, `core.max`, `core.clamp`, `core.add`, `core.subtract`, `core.multiply`, `core.divide` - instead of `core.runCode`/`doIf`. Example: a nova that scales with a counter but is capped at 10 - damage `core.add(4, core.multiply(core.min(core.getItemVariableNumber(player, "souls"), 10), 0.5))`, then `core.subtractItemVariable(player, "souls", core.min(core.getItemVariableNumber(player, "souls"), 10))` to spend only what was used. The numbers (4, 0.5, 10) are plain literals in the item, editable by the owner.

Upgrade pattern: on the trigger, `core.addItemVariable(player, "kills", 1)`, then `core.doIf` the total reached a threshold to bump a `level` variable, then `core.refreshItemLore(player)`. Block-mining progress uses a `customEvents` entry on `org.bukkit.event.block.BlockBreakEvent`.

## Item requirements

Lock an item behind a requirement so it is unusable until the holder meets it. While a player fails ANY rule the item does **nothing** for them: no abilities, no attacking, no mining, no stats. Add the `requirements` array; each rule is one of:

- **Permission** - `{ "type": "permission", "input": "myserver.vip" }`. Passes when the player has that permission node.
- **Placeholder** - `{ "type": "placeholder", "input": "%player_level%", "operator": ">=", "value": 10 }`. Resolves the PlaceholderAPI placeholder for the player and compares it. Operators: `>=`, `<=`, `>`, `<`, `==`, `!=` (numeric), `true` / `false` (the value is truthy / falsy), `equals` / `notequals` / `contains` (text). Placeholder rules need PlaceholderAPI installed; an unresolvable placeholder keeps the item locked.

All rules must pass (AND). Show the holder why with the `{requirement:&ctext}` lore placeholder - the text appears only while they fail and disappears once every rule passes. Set `requirementMessage` for a chat nudge when a locked player tries to use the item (sent at most once every 1.5s).

```json
{
  "name": "vip_blade",
  "fancyName": "<gradient:#ffd700:#ff8c00>VIP Blade</gradient>",
  "material": "DIAMOND_SWORD",
  "lore": ["&7A blade only the worthy may wield.", "{requirement:&cRequires rank VIP & level 10}"],
  "requirements": [
    { "type": "permission", "input": "myserver.vip" },
    { "type": "placeholder", "input": "%player_level%", "operator": ">=", "value": 10 }
  ],
  "requirementMessage": "&cYou do not meet this item's requirements."
}
```

## Item rarity

Tag an item with a rarity to colour it and (with ReforgesCore) scale its reforges. Rarities are defined server-side via `/ic rarities` - each has a display text, an order, a stat multiplier and a cost multiplier. Set the item's `rarity` field to a rarity id, then show it in lore with the `{rarity}` placeholder (it expands to that rarity's display text):

```json
{
  "name": "dragon_blade",
  "fancyName": "&cDragon Blade",
  "material": "NETHERITE_SWORD",
  "rarity": "legendary",
  "lore": ["{rarity}", "", "&7Forged in dragonfire.", "", "{stats}"],
  "stats": [{ "stat": "strength", "value": 120 }]
}
```

The rarity id must exist (create it with `/ic rarities`). When ReforgesCore reforges the item, the rarity's stat and cost multipliers apply. `rarity` round-trips through `/ic export`.

## Skins

Skins are provided by the **SkinsCore addon** (a separate plugin jar alongside ItemsCore). The `skin` block below is only applied when SkinsCore is installed; without it the block is ignored on import. Authoring is the same whether you write the `skin` block here or use the **Skin** tile in the SkinsCore section of `/itemeditor` - both store the same definition.

A **skin** is a cosmetic item that a player applies to *another* item in the Advanced Anvil (`/advancedanvil`). The skin item is consumed, and the target item takes on the skin's look. A skin is authored like any normal item (name, material, lore, even an `intervalAction`) plus a `skin` block. Once it has a `skin` block the item is never worn or held for gameplay - **all of its own abilities are ignored except its `intervalAction`** (used for rune particles), and it shows up as a modifier in the anvil.

Three types:

- **`dye`** - recolors the target armour piece as leather and sets its colour. Optionally animates a gradient between two colours while the piece is worn.
- **`head`** - replaces a helmet with a textured player head. Optionally animates between several textures (frames) while worn.
- **`rune`** - does not change the item at all; it only adds particles around the wearer while the target armor is **worn** (runes apply only to armor, a worn-only category, so a runed piece never animates while merely held). Author the particles with the rich **`animation`** block (recommended - see Rune animations) or, as an escape hatch, the skin item's `intervalAction`. A rune is **additive**: an item can carry one `dye`/`head` skin AND one `rune` at the same time. Applying another of the same kind overrides the previous one.

The `skin` block:

| Field | Type | Notes |
|---|---|---|
| `type` | `dye` \| `head` \| `rune` | Default `dye` |
| `target` | object | Which items the skin may be applied to (see below). Defaults to all armour |
| `color1` | string | **dye** - base leather colour `#RRGGBB` (default `#FFFFFF`) |
| `color2` | string | **dye** - optional second colour; when set, a worn piece animates a gradient `color1`↔`color2`. Empty = solid |
| `gradientPeriodTicks` | number | **dye** - ticks for one full gradient cycle while worn (min 2, default 40) |
| `pieceOffsetTicks` | number | **dye** - per-piece phase offset so a worn set flows instead of pulsing together (default 5) |
| `frames` | object[] | **head** - texture frames `{ "texture", "signature"?, "delayTicks" }`; more than one animates the head while worn. `texture` is a base64 value, URL, or bare hash (same as `skullTexture`) |
| `prefixOverride` | string | Optional display-name prefix shown before the item name (and before any reforge prefix). Defaults to the flower icon (config `skins.applied-icon`, default `✿`) |
| `prefixColorOverride` | string | Optional `&` colour for the prefix; defaults to the item name's leading colour |
| `loreFormat` | string | The `{applied_skin}` line this skin renders on the item it is applied to. Tokens: `%displayName%`, `%displayNameColor%`, `%type%`. Type any icon directly in the text - the default already includes `✿`. Default `%displayNameColor%✿ %displayName% applied` |
| `price` | number | Vault cost to apply this skin in the anvil. `-1` inherits the server default (config `skins.default-price`) |
| `animation` | object | **rune** - a built-in, orientation-aware particle animation played around the wearer: stacked shape layers with a frame clock, colours and motion. The recommended way to author rune effects (far richer than an `intervalAction`). See **Rune animations** below |

`target` modes:

- `{ "mode": "all_armor" }` - any armour piece (default).
- `{ "mode": "by_piece", "pieces": ["HELMET", "BOOTS"] }` - only those armour slots (`HELMET` / `CHESTPLATE` / `LEGGINGS` / `BOOTS`; a head/skull counts as `HELMET`).
- `{ "mode": "by_material", "materials": ["LEATHER", "PLAYER_HEAD"] }` - material names or family keywords (`LEATHER` matches every leather piece).
- `{ "mode": "by_id", "ids": ["dragon_blade"] }` - only those custom ItemsCore items, by internal name.

Regardless of `target`, a skin can only be applied to an **Armor**-type custom item (a real armour piece, or an item whose item-type is Armor). Equipment-type items, talismans, off-hand and normal items are always rejected in the anvil.

Show the applied skin in the *target* item's lore with the `{applied_skin}` placeholder - it expands to one line per applied cosmetic (skin and/or rune), or nothing when the item has none.

A dye skin that recolors any leather armour with a worn red↔gold gradient:

```json
{
  "name": "ember_dye",
  "fancyName": "&cEmber Dye",
  "material": "LEATHER_CHESTPLATE",
  "lore": ["&7Apply in the anvil to recolor", "&7any leather armour piece."],
  "skin": {
    "type": "dye",
    "target": { "mode": "by_material", "materials": ["LEATHER"] },
    "color1": "#FF3030",
    "color2": "#FFC030",
    "gradientPeriodTicks": 40,
    "pieceOffsetTicks": 5,
    "price": 2500
  }
}
```

A head skin that turns any helmet into a textured head:

```json
{
  "name": "pumpkin_skin",
  "fancyName": "&6Jack o' Skin",
  "material": "PLAYER_HEAD",
  "lore": ["&7Apply in the anvil to any helmet."],
  "skin": {
    "type": "head",
    "target": { "mode": "by_piece", "pieces": ["HELMET"] },
    "frames": [
      { "texture": "eyJ0ZXh0dXJlcyI6...", "delayTicks": 10 }
    ],
    "price": 4000
  }
}
```

A rune skin that adds particles while the target is worn (its `intervalAction` runs on the wearer):

```json
{
  "name": "flame_rune",
  "fancyName": "&cFlame Rune",
  "material": "BLAZE_POWDER",
  "lore": ["&7Apply in the anvil to add", "&7a flame aura while worn."],
  "skin": { "type": "rune", "target": { "mode": "all_armor" }, "price": 5000 },
  "actions": [
    { "trigger": "intervalAction", "interval": 5, "steps": [
      { "call": "particles.circle", "args": [0.8, 0.8, 1, 30, 1, { "call": "particles.withLocation", "args": [ { "call": "particles.of", "args": ["FLAME"] }, { "call": "player.getLocation", "args": [] } ] } ] }
    ] }
  ]
}
```

### Rune animations

A `rune` skin can carry an **`animation`** - a built-in particle effect that plays around the wearer every frame, with a real frame clock so it actually moves (spins, travels, pulses, cycles colour). This is the recommended way to author runes; the raw `intervalAction` still runs only when there is no `animation`, as an advanced escape hatch. The same engine and editor power the in-game **Particle animation** button in the rune's Skin tile, so a `.import` and a GUI edit are interchangeable. Particles are real world particles, visible to the wearer and to everyone nearby.

**Reusable named animations (no code).** The exact same animation engine is also a standalone library. An admin builds a named animation entirely in the GUI with `/ic animations` (a categorized shape picker, stacked layers, colours and a live "Test on me"), and it is saved to `plugins/ItemsCore/animations/`. Any item action can then play it by name - `particles.playAnimation(player, "name", ticks)`, or at a fixed point `particles.playAnimationAt(loc, "name", ticks)` - with no animation code at all. Building one inline with `core.createAnimation()` + `core.createAnimationLayer()` stays available as the scripting escape hatch, but referencing a saved animation by name is the simpler path and the one to prefer.

```json
"animation": {
  "orientation": "yaw",
  "anchor": "above_head",
  "speed": 1.0,
  "period": 2,
  "layers": [
    { "shape": "circle", "particle": "FLAME", "radius": 0.6, "count": 22, "spin": 5 }
  ]
}
```

The animation:

| Field | Type | Notes |
|---|---|---|
| `orientation` | `world` \| `yaw` \| `look` | How the shape follows the player's view. `world` = fixed to the world; `yaw` (default) = turns with the player but stays upright (a halo that spins with you); `look` = tilts fully to wherever the player looks |
| `anchor` | `feet` \| `body` \| `eyes` \| `above_head` | Where it is centred on the wearer. Default `body` |
| `speed` | number | How fast the whole animation evolves (the frame-clock rate). Default `1.0` |
| `period` | number | Render a frame every N ticks. Higher = fewer particles and less lag. Default `1` |
| `layers` | object[] | One or more stacked shape layers (below). An empty list means no animation |

Each layer:

| Field | Type | Notes |
|---|---|---|
| `shape` | string | The form (see Shapes). Default `circle` |
| `particle` | string | Named particle (e.g. `FLAME`, `SOUL_FIRE_FLAME`, `END_ROD`). Used when no colour is set. Default `FLAME` |
| `color1` | string | `#RRGGBB` for a coloured dust. When set it overrides `particle` |
| `color2` | string | Second `#RRGGBB`; with `pulse` the dust fades `color1`↔`color2` |
| `colorMode` | `auto` \| `solid` \| `pulse` \| `rainbow` | `auto` (default) picks from the colours set (none = particle, one = solid, two = pulse); `rainbow` is a per-point hue sweep (a real rainbow ring) and ignores the colours |
| `size` | number | Dust size (coloured layers only). Default `1.0` |
| `radius` | number | Overall size of the shape. Default `1.0` |
| `count` | number | How many particles make up the shape. Default `24` |
| `height` | number | Vertical size, for shapes that use it. Default `1.0` |
| `p1`, `p2`, `p3` | number | Per-shape knobs - see the Shapes table for what each one means |
| `spin` | number | Degrees the shape rotates each frame (negative spins the other way) |
| `speed` | number | This layer's own time rate, multiplied by the animation `speed`. Default `1.0` |
| `phase` | number | Starting offset around the shape (radians) |
| `offset` | [x, y, z] | Local offset of the layer from the anchor |
| `x`, `y`, `z` | string | **equation shape only** - a formula per axis (below) |

**Shapes** (and what each reads from `radius`/`height`/`p1`/`p2`/`p3`):

| Shape | Uses | p1 | p2 | p3 |
|---|---|---|---|---|
| `circle` | radius, count | - | - | - |
| `ring` | radius, count (stands upright) | - | - | - |
| `helix` | radius, height, count | turns | strands | - |
| `spiral` | radius, count | turns | - | - |
| `wave` | radius = width, height = amplitude, count | waves | - | - |
| `polygon` | radius, count | sides | - | - |
| `star` | radius, count | points | inner size 0-1 | - |
| `rose` | radius, count | petals | - | - |
| `heart` | radius, count | - | - | - |
| `infinity` | radius, count | - | - | - |
| `lissajous` | radius, height, count | freq X | freq Y | freq Z |
| `sphere` | radius, count | - | - | - |
| `torus` | radius = ring, height = tube, count | loops | coils | - |
| `cone` | radius, height, count | turns | - | - |
| `vortex` | radius, height, count | turns | - | - |
| `atom` | radius, count | - | - | - |
| `galaxy` | radius, count | arms | twist | - |
| `line` | height = length, count | - | - | - |
| `point` | offset | - | - | - |
| `equation` | count, x/y/z formulas | - | - | - |

**Equation shape** - set `x`, `y`, `z` to a formula evaluated for every point. Local axes: `x` = right, `y` = up, `z` = forward. Variables: `t` (frame time), `i` (point index `0..count-1`), `n` (count). Constants `pi`, `e`; maths `+ - * / ( )` and `sin cos tan`. Spread points evenly with `i / n * 2 * pi`. Example - a wavy rotating ring of END_ROD:

```json
{ "shape": "equation", "particle": "END_ROD", "count": 36,
  "x": "cos(i / n * 2 * pi + t * 0.05) * 1.1",
  "y": "sin(i / n * 2 * pi * 2) * 0.5",
  "z": "sin(i / n * 2 * pi + t * 0.05) * 1.1" }
```

A complete rune that spins a rainbow halo above the wearer's head:

```json
{
  "name": "prism_halo_rune",
  "fancyName": "&dPrism Halo",
  "material": "PRISMARINE_CRYSTALS",
  "lore": ["&7Apply in the anvil to crown", "&7the wearer with a rainbow halo."],
  "skin": {
    "type": "rune",
    "target": { "mode": "all_armor" },
    "price": 14000,
    "animation": {
      "orientation": "yaw",
      "anchor": "above_head",
      "speed": 1.0,
      "period": 2,
      "layers": [
        { "shape": "circle", "colorMode": "rainbow", "radius": 0.6, "count": 30, "size": 1.1, "spin": 3 }
      ]
    }
  }
}
```

To keep a skin from being undone by vanilla, an admin can block vanilla cosmetic edits on custom items with `/ic cosmetics` (config `block-vanilla-cosmetics`): leather dyeing, cauldron washing, armor trims, and banner/firework/shield combining. Every option is off (allowed) by default, the `all` master blocks them all at once, and only custom ItemsCore items are affected.

## Item cooldowns

Two separate things: the **gate** and the **grey-out**. The action `cooldown` field (above) is the gate - it blocks the action from re-triggering and sends the `cooldownMessage`, per item. It does NOT grey the item out on its own. The grey-out is opt-in: call `core.setItemCooldown(player, 3)` inside the action to put a real vanilla cooldown on the held item for 3 seconds (greys out with the sweeping overlay like an ender pearl, per item on 1.21.2+). This is deliberate, because one item can have several actions with different cooldowns. Guard an ability with `core.hasItemCooldown(player)` and `core.getItemCooldownRemaining(player)` (ticks left).

For area-of-effect abilities, prefer the ready-made structured helpers so you never need a loop string: `core.pullNearbyLiving(player, x, y, z, strength)` (vacuum/black hole), `core.knockbackNearbyLiving(player, x, y, z, strength)` (shockwave) and `core.lightningNearbyLiving(player, x, y, z)` (chain storm). They all act only on players and mobs, never dropped items or xp orbs. For a custom per-target effect that has no helper, fall back to `core.loopThrough("...currentArrayObject...", core.getNearbyLivingEntities(player, 6, 4, 6).toArray(), 2)`. Use `core.dashForward(player, power, lift)` for a dash/leap in the look direction.

Custom items are unplaceable: the plugin blocks placing a custom item as a block no matter its material, so you can freely use materials like POPPY, GLOWSTONE or any block as an item without it being placeable.

## Morphing an item

`core.morphHeldItem(player, "MAGMA_BLOCK")` changes only how the held item LOOKS by swapping its material, while it stays the exact same custom item (same id, lore and behavior). `core.unmorphHeldItem(player)` restores the original material. Use it for disguises or dynamic appearances.

## Worked example: a lucky voucher (one-time consumable)

A stackable consumable that is removed on use and gives a random reward. `core.removeHeldItem(player)` consumes one (removes the stack when it hits the last one). `core.randomFromList` rolls a reward id and `core.giveCustomItem` hands a fresh unique copy over.

```json
{
  "name": "lucky_voucher",
  "fancyName": "&6Lucky Voucher",
  "material": "PAPER",
  "needBlock": "BOTH",
  "lore": ["&7Right-click to claim a random reward."],
  "talisman": false,
  "stackable": true,
  "actions": [
    {
      "trigger": "rightAction",
      "needBlock": "BOTH",
      "steps": [
        { "call": "core.removeHeldItem", "args": [ { "var": "player" } ], "operatorToNext": "END" },
        { "call": "core.giveCustomItem", "args": [ { "var": "player" }, { "call": "core.randomFromList", "args": ["magic_sword,storm_blade,healers_touch"] }, 1 ], "operatorToNext": "END" },
        { "call": "core.sendColorMessage", "args": [ { "var": "player" }, "&aYou claimed a reward!" ], "operatorToNext": "END" }
      ]
    }
  ],
  "customEvents": []
}
```

## Worked example: an upgradable blade (item variables + dynamic lore)

```json
{
  "name": "upgrade_blade",
  "fancyName": "&bUpgrade Blade",
  "material": "IRON_SWORD",
  "needBlock": "BOTH",
  "lore": ["&7Kills: &f{var_kills}", "&7Power: &f{var_power}"],
  "talisman": false,
  "actions": [
    {
      "trigger": "leftAction",
      "needBlock": "BOTH",
      "steps": [
        { "call": "core.addItemVariable", "args": [ { "var": "player" }, "kills", 1 ], "operatorToNext": "END" },
        { "call": "core.refreshItemLore", "args": [ { "var": "player" } ], "operatorToNext": "END" }
      ]
    }
  ],
  "customEvents": []
}
```

## Bukkit objects expose their full Spigot API

`player`, `shooter`, `victim`, `arrow`, `event`, and any entity, block, world, location, or `ItemStack` returned by a method are real Bukkit/Spigot objects. You can call any standard Spigot method on them in a step, not only the ItemsCore methods:

- `{ "call": "player.sendMessage", "args": ["&aHi"] }`
- `{ "call": "player.setFireTicks", "args": [60] }`
- `{ "call": "victim.getHealth", "args": [] }`
- `{ "call": "player.getWorld", "args": [] }`

These are not in the `core` / `particles` / `values` / `api` method list. For the complete set, see the Spigot API docs at https://hub.spigotmc.org/javadocs/spigot/ (match your server version). Prefer a `core` method when one exists; use raw Spigot calls for the rest.

## Bindings (summary)

- `core` - the main toolkit: messaging, teleport, damage/heal, effects, sounds, projectiles, conditions, loops, variables, commands, placeholders.
- `particles` - build and display particle effects (`of`, `colored`, `withLocation`, `circle`, ...).
- `values` - custom values registered by addons.
- `api` - the public plugin API.

Always confirm a method's exact name and parameters with `get_method` / `search_methods` before using it. Do not guess.

## Projectiles

`core.shootProjectile` and `core.createEquationVector` use a movement equation whose axes are relative to where the player looks: **X = forward, Y = up, Z = left**. A straight forward-flying projectile puts the motion on X, e.g. `core.createEquationVector("t * 0.4", "0", "0")`. Use Y for arc/gravity and Z to curve left/right.

## Worked example: a healing ability wand

```json
{
  "name": "healers_touch",
  "fancyName": "&dHealer's Touch",
  "material": "BLAZE_ROD",
  "needBlock": "BOTH",
  "lore": ["&7Right-click to channel healing energy."],
  "enchantments": [{ "name": "LUCK", "level": 1 }],
  "flags": ["HIDE_ENCHANTS"],
  "talisman": false,
  "actions": [
    {
      "trigger": "rightAction",
      "needBlock": "BOTH",
      "steps": [
        { "call": "core.sendColorMessage", "args": [ { "var": "player" }, "&aYou channel healing energy!" ], "operatorToNext": "END" },
        { "call": "core.heal", "args": [ { "var": "player" }, 6 ], "operatorToNext": "END" },
        { "call": "core.giveEffect", "args": [ { "var": "player" }, "REGENERATION", 100, 1, false, true ], "operatorToNext": "END" },
        { "call": "core.playSound", "args": [ { "var": "player" }, { "call": "player.getLocation", "args": [] }, { "call": "core.getSound", "args": ["ENTITY_PLAYER_LEVELUP"] }, 1, 1 ], "operatorToNext": "END" }
      ]
    }
  ],
  "customEvents": []
}
```

## Worked example: a lightning sword with a chance roll

```json
{
  "name": "storm_blade",
  "fancyName": "&bStorm Blade",
  "material": "DIAMOND_SWORD",
  "needBlock": "BOTH",
  "lore": ["&7Left-click: 25% chance to call lightning."],
  "enchantments": [{ "name": "DAMAGE_ALL", "level": 4 }],
  "talisman": false,
  "actions": [
    {
      "trigger": "leftAction",
      "needBlock": "BOTH",
      "steps": [
        { "call": "core.doIf", "args": [ { "call": "core.chanceOf", "args": [25] }, "core.summonLightningByLocation(player.getLocation())" ], "operatorToNext": "END" }
      ]
    }
  ],
  "customEvents": []
}
```

Note on `core.doIf(boolean condition, String action)`: the second argument is a short string of script that runs only when the condition is true. Keep that string to a single statement and use methods you have verified exist. For multi-step conditional logic, run several `doIf` steps.

## Before you deliver

1. Every `trigger` is in the table above.
2. Every `core.` / `particles.` / `values.` / `api.` call is a real method (checked with `get_method`).
3. Argument order and count match the method signature.
4. Run `validate_item` and clear all errors.
