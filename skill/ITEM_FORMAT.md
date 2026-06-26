# ItemsCore clean item JSON reference

This is the offline reference for the item format ItemsCore imports. When the live API is reachable, prefer it (`get_item_schema`, `search_methods`, `get_method`), because it reflects the exact methods on the user's server. Use this file when offline.

## Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string, required | Internal id, no spaces (e.g. `flame_sword`) |
| `fancyName` | string | Display name, supports `&` color codes |
| `id` | string | Optional explicit id; defaults to `name` |
| `material` | string, required | Bukkit material (e.g. `DIAMOND_SWORD`, `BLAZE_ROD`, `PLAYER_HEAD`) |
| `needBlock` | `BOTH` \| `AIR` \| `BLOCK` | Default interaction context for the item |
| `lore` | string[] | Lore lines, support `&` color codes |
| `enchantments` | `{ name, level }[]` | e.g. `{ "name": "DAMAGE_ALL", "level": 3 }` |
| `flags` | string[] | Bukkit ItemFlag names (e.g. `HIDE_ATTRIBUTES`) |
| `talisman` | boolean | If true, the item works from anywhere in the inventory |
| `stackable` | boolean | If true, the item drops its unique per-item id so identical copies stack together. Use it for consumables and currency like vouchers, crates and coins. Leave it `false` (default) for gear that must stay unique. Stackable items are skipped by dupe detection |
| `customModelData` | number | Resource-pack model id |
| `unbreakable` | boolean | If true, the item never loses durability (applied version-safely). Pair with the `HIDE_UNBREAKABLE` flag to hide the tag |
| `skullOwner` | string | Player name, for `PLAYER_HEAD` skins |
| `skullTexture` | string | Custom skin for a `PLAYER_HEAD`: a base64 texture value, a texture URL (`http://textures.minecraft.net/texture/...`), or a bare texture hash. Renders as a real inventory item across versions. Leave empty for none |
| `skullSignature` | string | Optional Mojang signature for `skullTexture` (only needed for signed textures; usually omitted) |
| `stats` | object[] | Stat modifiers (authored in the editor; preserved on re-import) |
| `actions` | Action[] | The built-in trigger behavior graph (see below) |
| `customEvents` | object[] | React to ANY Bukkit event by its full class name (see Custom events) |
| `recipe` | object[] | Optional shaped crafting recipe, up to 9 slots row-major (3x3). `null` for empty slots. Each slot is `{ "material": "DIAMOND", "amount": 1 }` (vanilla) or `{ "item": "custom_item_name", "amount": 1 }` (another custom item). `amount` defaults to 1 and is how many are consumed from that slot, so `amount > 1` is supported. Example: `[{"material":"DIAMOND"},null,null,{"material":"DIAMOND"},null,null,{"material":"STICK"},null,null]` |
| `attributes` | object[] | Addon attributes applied to the item (reforge stones, PowerScrolls, etc.). Each entry is `{ "addon", "attribute", "value" }`. See Addon attributes |

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
