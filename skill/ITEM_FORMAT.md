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
| `customModelData` | number | Resource-pack model id |
| `skullOwner` | string | Player name, for `PLAYER_HEAD` skins |
| `stats` | object[] | Stat modifiers (authored in the editor; preserved on re-import) |
| `actions` | Action[] | The behavior graph (see below) |
| `events` | object[] | Custom event definitions |

## Action

```json
{ "trigger": "rightAction", "needBlock": "BOTH", "steps": [ ... ] }
```

| Field | Type | Notes |
|---|---|---|
| `trigger` | string, required | One of the triggers below |
| `needBlock` | `BOTH` \| `AIR` \| `BLOCK` | Optional per-action override of the item default |
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
| `projectileHitEntityEvent` | A custom projectile from this item hits an entity | shooter, victim, item, lastLocation, event |
| `projectileHitBlockEvent` | A custom projectile from this item hits a block | shooter, item, lastLocation, event |

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
  "events": []
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
  "events": []
}
```

Note on `core.doIf(boolean condition, String action)`: the second argument is a short string of script that runs only when the condition is true. Keep that string to a single statement and use methods you have verified exist. For multi-step conditional logic, run several `doIf` steps.

## Before you deliver

1. Every `trigger` is in the table above.
2. Every `core.` / `particles.` / `values.` / `api.` call is a real method (checked with `get_method`).
3. Argument order and count match the method signature.
4. Run `validate_item` and clear all errors.
