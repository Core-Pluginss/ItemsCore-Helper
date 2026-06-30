---
name: itemscore
description: Build and edit custom Minecraft RPG items for the ItemsCore plugin. Use whenever the user wants to create a new item, change how an item behaves, add an ability or particle effect, or fix an ItemsCore item. The user runs a Minecraft server with ItemsCore installed; you produce a clean item JSON file they import in-game.
---

# ItemsCore item builder

ItemsCore is a Minecraft (Bukkit/Spigot) plugin that lets a server owner create fully custom RPG items without writing Java. You help the user build those items.

## The one rule that matters

Always produce a **clean item JSON** (the format described below). Never hand-write the plugin's internal item YAML or its generated JavaScript `code`. When the user imports your JSON, the plugin builds **both** the runnable code **and** the in-game GUI action graph from it. That means an item you create this way still works **and** stays fully editable in the in-game editor. Hand-writing raw code produces an item the GUI cannot open, which is exactly the problem this format avoids.

## Step 0: Find the ItemsCore folder

Before creating or changing anything, locate the **ItemsCore plugin folder**. It is the folder named `ItemsCore` inside the server's `plugins` folder (`plugins/ItemsCore/`) and it contains an `items/` folder, a `stats/` folder, and `config.yml`. Items go in its `imports/` folder; stats live in `stats/stats.yml`.

If you cannot find a folder with those markers from where you are running (check the working directory and obvious server paths), **ask the user for the absolute path to their ItemsCore plugin folder** (for example `C:\Servers\survival\plugins\ItemsCore`) and use that. Never guess a path or write files outside that folder.

## Step 1: Get the API (do this first)

Use the real API instead of guessing method names.

**Verify the tooling before you trust it - do not assume.** At the start of every session, and right after any install, call **`health_check`**. The fact that it answers proves the `itemscore` MCP server is actually connected. Never tell the user the tooling is installed or ready because you *ran an install command* - say it only after `health_check` returns. If you cannot call it, the server is not loaded: run `npx -y itemscore-helper@latest install` (or `npx -y itemscore-helper@latest doctor` to repair and restore missing files), reload the MCP servers, and check again. If `health_check` returns `nextActions` (outdated helper, missing skill files, a stale exported API), do them before building. The user may have moved or deleted files since last time, or a newer version may have shipped - a previous install being fine does not mean it still is.

Preferred - the `itemscore` MCP server. It runs locally on the user's machine (installed with `npx itemscore-helper`) and exposes these tools. If it is connected, call them:
- `health_check()` - verify the server is connected, the API is current, and the skill files exist; returns `ok` and a `nextActions` list. Call this first.
- `search_methods(query, binding?, includeUseless?)` - find scripting methods by name, category, or description
- `get_method(name, binding?)` - full signature, params, return, and example for one method (accepts `core.teleport` or `teleport`)
- `list_triggers()` - every trigger an item can react to, and the variables available in each
- `list_events()` - custom events and the global variables (player, event, core, particles, ...)
- `get_item_schema()` - the full field reference for the clean item JSON
- `validate_item(item)` - checks an item JSON and returns errors and warnings
- `generate_item_template(kind?)` - a valid starter item (`basic` or `ability`)
- `get_stat_schema()` - the stats.yml format for creating and editing stats
- `validate_stat(stat)` - checks one stat object before you write it into stats.yml
- `list_commands()` - every in-game command (usage, description, permission) so you can help with anything
- `check_updates()` - confirm the helper and API are current. Call this if a method is missing or an imported item does not work: the local helper may be out of date, or a stale `/ic exportapi` file may be in use. It tells you whether to run `npx -y itemscore-helper@latest install` (then reload MCP) or `/ic exportapi` in-game.

Fallback - if no MCP is connected, a hosted copy is available over plain HTTP:
- MCP endpoint: `https://www.coredevelopment.shop/api/mcp`
- API manifest: `https://www.coredevelopment.shop/api/itemscore/manifest`
- Item schema: `https://www.coredevelopment.shop/api/itemscore/item-schema`
- Stat format: `https://www.coredevelopment.shop/api/itemscore/stat-schema`
- Commands: `https://www.coredevelopment.shop/api/itemscore/commands`
- Quick guide: `https://www.coredevelopment.shop/llms.txt`

If nothing is reachable, use `ITEM_FORMAT.md` in this folder as the offline reference.

## Step 2: Build the item JSON

Minimal shape:

```json
{
  "name": "flame_sword",
  "fancyName": "&cFlame Sword",
  "material": "DIAMOND_SWORD",
  "needBlock": "BOTH",
  "lore": ["&7Left-click to ignite the server."],
  "type": "normal",
  "actions": [
    {
      "trigger": "leftAction",
      "needBlock": "BOTH",
      "steps": [
        { "call": "core.broadcastMessage", "args": ["The flame sword roars!"], "operatorToNext": "END" }
      ]
    }
  ],
  "customEvents": []
}
```

Rules:
- `name` and `material` are required. `material` is a Bukkit material name (e.g. `DIAMOND_SWORD`, `BLAZE_ROD`).
- Color codes use `&` (e.g. `&c` red, `&a` green).
- `trigger` must be one of the valid triggers (call `list_triggers`). Common ones: `leftAction` (left-click, which is also the attack swing), `rightAction` (right-click, e.g. cast an ability), `shiftAction` (start sneaking), `playerDamageEvent` (the wearer takes damage), `projectileHitEntityEvent` (a custom projectile from the item hits an entity). There is no separate melee-attack trigger; left-click is the attack.
- Each step has a `call`, an `args` array, and `operatorToNext`. `call` is `core.method`, `particles.method`, a Bukkit call like `player.getLocation`, or a bare variable name to read it.
- An arg is a JSON literal, `{ "var": "player" }` to pass a variable, or a nested `{ "call": ..., "args": ... }` to pass one method's result into another.
- `operatorToNext` joins a step to the next one. Use `END` to end a statement. Other values (`ADD`, `EQUALS`, `AND`, ...) build expressions and conditions. See `ITEM_FORMAT.md`.
- `actions` only cover the built-in triggers. To react to any OTHER Bukkit event, add a `customEvents` entry with the event's full class name (e.g. `org.bukkit.event.block.BlockBreakEvent`) and the same `steps` format - variables are `player`, `item`, `event`. The import is blocked if the class name is not found on the server, so use the exact fully-qualified name.

Advanced item features (full details and worked examples in `ITEM_FORMAT.md`):
- **Per-item variables and dynamic lore:** store state that travels with the exact item (`core.setItemVariable` / `core.addItemVariable` / `core.getItemVariable`), show it in lore with the `{var_key}` placeholder, and redraw it live with `core.refreshItemLore`. This is how you build upgradable items and counters.
- **One-time consumables (vouchers, crates):** set `"stackable": true` so copies stack, then `core.removeHeldItem` to consume one and `core.giveCustomItem(player, core.randomFromList("a,b,c"), 1)` to hand out a random fresh reward.
- **Visual item cooldowns:** `core.setItemCooldown(player, seconds)` greys the item and shows the ender-pearl sweep; guard with `core.hasItemCooldown`.
- **Morphing:** `core.morphHeldItem(player, material)` changes only the look while keeping the same item; `core.unmorphHeldItem` restores it.
- **Block abilities (vein miner, etc.):** from a `BlockBreakEvent` custom event, `core.veinMine(event, item, 64, 8)` shatters the whole connected vein of the same block; `core.breakBlockWithItem(block, item)` mines a single block with the item's own drops.
- **Delayed effects:** schedule with `core.runRunnableLater(core.createRunnable("...code..."), ticks)` (20 ticks = 1s). Build the runnable with `core.createRunnable` and let the action call it; never eval a raw code string at runtime.
- **Use requirements:** lock an item until the holder meets a rule (a permission, or a PlaceholderAPI value compared with `>=`, `true`, `contains`, etc.). A locked player gets nothing from it - no abilities, no attacking, no mining, no stats. Add the `requirements` array and show why with the `{requirement:&ctext}` lore placeholder.
- **Per-item stats:** give an item stat values right in the JSON with the `stats` array (`[{ "stat": "strength", "value": 50 }]`); the stat must exist in `stats.yml`. Render the block with the `{stats}` lore placeholder. No editor step needed.
- **Leather armour colour:** set `color` to a `#RRGGBB` hex to dye `LEATHER_*` armour. Use the same colour across helmet/chestplate/leggings/boots for a matching set.
- **Item type (where it works):** `type` controls where the item's stats and effects are active - `"normal"` (hand + off-hand, the default), `"talisman"` (passive from anywhere in the inventory), `"off_hand"` (only in the off-hand), or `"armor"` (only while worn). Set `"armor"` for custom armour and for player-head helmets so reforges/wardrobe treat them as armour. The old `talisman: true` boolean still works and equals `type: "talisman"`.
- **MiniMessage names and lore:** `fancyName` and `lore` accept MiniMessage tags (`<gradient>`, `<rainbow>`, `<#hex>`, `<bold>`) alongside `&` codes; gradients and hex render fully on 1.16+ and downsample to the nearest colours on older versions.
- **Rarity:** set `rarity` to a rarity id (created server-side via `/ic rarities`) to tag the item; show it in lore with the `{rarity}` placeholder. With ReforgesCore, the rarity scales a reforge's stat and cost multipliers.
- **Cosmetic skins (SkinsCore addon):** add a `skin` block to turn an item into a skin players apply to *other* items in the Advanced Anvil (`/advancedanvil`). `dye` recolors armour as leather (optional worn gradient), `head` swaps a helmet for a textured head (optional worn frames), `rune` only adds particles (from the item's `intervalAction`) and stacks on top of a dye/head. Target by all-armour / piece / material / id. Show it on the target with the `{applied_skin}` lore placeholder. Requires the **SkinsCore** addon installed (the `skin` block and `{applied_skin}` only work with it; the block is ignored on import otherwise). Admins can stop vanilla from undoing skins with `/ic cosmetics`. See ITEM_FORMAT.md > Skins.

Find the exact method you need with `search_methods` / `get_method` before using it. Do not invent method names.

## Addon items: reforge stones, PowerScrolls, and other addon attributes

Some features come from ItemsCore **addons** (separate plugins) that attach **attributes** to an item. Set them with an `attributes` array in the item JSON - each entry is `{ "addon", "attribute", "value" }`, using the exact addon and attribute names shown in the in-game addon editor. Call `get_item_schema` and read its `knownAddons` map for the current list.

- **Reforge stone (ReforgesCore)** - turns the item into a stone that applies a named reforge in the Anvil (`/advancedreforge`) menu. The reforge must already exist on the server (created with `/reforges`).
  ```json
  {
    "name": "sharp_stone", "fancyName": "&bSharpness Stone", "material": "PAPER",
    "attributes": [ { "addon": "ReforgesCore", "attribute": "Reforge stone", "value": "sharp" } ]
  }
  ```
- **PowerScroll (PowerScrolls)** - turns the item into a scroll used to upgrade other items and add abilities to them.
  ```json
  {
    "name": "power_scroll", "fancyName": "&dPower Scroll", "material": "WRITABLE_BOOK",
    "attributes": [ { "addon": "PowerScrolls", "attribute": "Is a scroll", "value": true } ]
  }
  ```
- **Unreforgeable (ReforgesCore)** - `{ "addon": "ReforgesCore", "attribute": "Unreforgeable", "value": true }` blocks the item from ever being reforged.
- **Equipment piece (EquipmentCore)** - makes the item wearable equipment of a given type. It is worn in the `/equipment` menu in a slot that accepts that type and, like armour, contributes its stats and equip/unequip abilities ONLY while equipped. Use a type id the server defined in EquipmentCore (e.g. `necklace`, `cloak`, `belt`, `gloves`, `bracelet`). Pair it with `"type": "armor"` so the piece never gives its stats while merely held or sitting in the inventory.
  ```json
  {
    "name": "vampire_necklace", "fancyName": "&cVampire Necklace", "material": "NETHER_STAR",
    "type": "armor",
    "attributes": [ { "addon": "Equipment", "attribute": "type", "value": "necklace" } ],
    "stats": [ { "stat": "Health", "value": 50 } ]
  }
  ```

Values are strings for text attributes (like the reforge name) and `true`/`false` for toggles. Importing over an existing item merges attributes in: it overwrites the named one and keeps the rest. `/ic export <item>` writes the item's attributes too, so you can export, tweak, and re-import. Only the named addon needs to be installed for its attribute to do anything in-game.

## Bukkit and Spigot objects

The variables `player`, `shooter`, `victim`, `arrow`, `event`, and any entity, block, world, location, or item you get back from a method are real Bukkit/Spigot objects. They expose their entire normal Spigot API, not just the ItemsCore methods, so you can call any standard Spigot method on them directly in a step.

Examples:
- `{ "call": "player.sendMessage", "args": ["&aHi"] }`
- `{ "call": "player.getHealth", "args": [] }`
- `{ "call": "player.getWorld", "args": [] }`
- `{ "call": "victim.setFireTicks", "args": [100] }`
- `{ "call": "player.getLocation", "args": [] }` (pass the result into another call)

These Spigot methods are not listed by `search_methods`, because the ItemsCore API (`core`, `particles`, `values`, `api`) is only one part of what you can call. For the full set of methods on `player`, `event`, entities, blocks, worlds, and locations, use the Spigot API docs at https://hub.spigotmc.org/javadocs/spigot/ and match the server's Minecraft version. Prefer a `core` method when one exists (for example `core.heal`, `core.teleport`, `core.giveEffect`), and use raw Spigot calls for anything `core` does not cover.

## Step 3: Validate

Run `validate_item` on your JSON. Fix every entry under `errors` before continuing. Read the `warnings` too - most are harmless (for example a Bukkit call the API cannot introspect), but a warning that an argument **passes a variable that is not a known built-in** is not harmless: an undefined variable compiles to a raw identifier and crashes the item with `"<name> is not defined"` at runtime. If you did not define that variable in an earlier step, replace it with a literal value or a real variable (`player`, `item`, `event`, ...).

## Step 4: Hand it to the user

1. Save the JSON with a `.import` extension, for example `flame_sword.import`. **Always use `.import`, never `.item`.** `.item` is the plugin's own internal saved-item format - if you name the file `.item` the user will be confused and the import flow will not pick it up correctly. (The file is plain JSON; the `.import` extension just marks that it belongs in the imports folder.)
2. Tell the user to put the file in `plugins/ItemsCore/imports/` on their server.
3. Tell them to run `/ic import <name>` in-game.

On success the plugin replies: `Imported <name> (N action(s)). It is now live and GUI-editable.` The item is immediately usable and can be opened in the editor with `/itemeditor <name>`.

## Editing an item that is already imported

Items are identified by their `name`. **To change an item that already exists, do not start over - update it in place:**

- **Behavior / actions (abilities, particles, projectiles, stats):** build the updated clean JSON with the **same `name`** and import it again exactly like a new item (save as `<name>.import`, `/ic import <name>`). Importing over an existing name **overwrites** the item and keeps its stats, recipe, and attributes. If you do not already have the item's JSON, have the user run `/ic export <name>` first - the plugin writes `plugins/ItemsCore/exports/<name>.json`, which you edit and re-import. Do **not** hand-edit the stored `plugins/ItemsCore/items/<name>.item` file for behavior changes: its `code` and `actions` are machine-encoded (strings as char codes, shared YAML anchors) and editing them by hand will corrupt the item.
- **Cosmetic only (display name, lore, material, custom model data, skull owner):** these top fields *are* plain text in the stored item file. You may edit `plugins/ItemsCore/items/<name>.item` directly and tell the user to run `/ic reload <name>` to apply it. For anything touching `code` or `actions`, use the re-import flow above instead.

If the item is a **legacy code-only item** (made before this format, so the editor cannot open it), have the user run `/ic adopt <name>` first. That converts its code into GUI actions; then export, edit, and re-import as above.

## Stats

Stats are named values shown on items (Strength, Crit Chance, Mana, ...). Unlike items, a stat is a simple flat object that is safe to edit directly. Call `get_stat_schema` for the full reference and `validate_stat` to check one before writing it.

- Stats are defined globally in `plugins/ItemsCore/stats/stats.yml`, a plain YAML list.
- Each entry MUST begin with the exact marker line `==: me.tastycake.itemscore.item.stats.Stat`.
- Fields: `name` (id, no spaces), `fancyName` (lore label, `&` colors), `fancyValue` (value format containing `%value%`), `baseValue` (default number).

```yaml
stats:
- ==: me.tastycake.itemscore.item.stats.Stat
  name: strength
  fancyName: '&cStrength'
  fancyValue: '&c+%value%'
  baseValue: 10
```

To create or edit a stat: edit `stats.yml`, then tell the user to run `/ic reload stats` (or `/ic reload stats <name>` for one). The in-game GUI is `/stats`. Per-item stat values are set either in the item JSON via its `stats` array (`[{ "stat": "strength", "value": 50 }]`) or in the editor (`/itemeditor <item>` -> Stats); item lore shows each active stat as `fancyName` + space + `fancyValue` with `%value%` replaced by the effective value.

## Command cheat sheet

Call `list_commands` for the full list. The ones you use most:

| Command | What it does |
|---|---|
| `/ic import <file>` | Import a clean JSON from `plugins/ItemsCore/imports/` (live + GUI-editable) |
| `/ic export <item>` | Write an existing item to `plugins/ItemsCore/exports/<item>.import` |
| `/ic give <player> <item> [amount]` | Give a custom item to an online player (now) or offline player (queued, delivered on join, silently). Non-stackable copies each get a fresh id. Console-friendly |
| `/ic adopt <item>` | Make a legacy code-only item GUI-editable |
| `/ic reload [items\|stats] [name]` | Reload everything, a whole category, or one item/stat |
| `/ic install <item\|template\|stat\|addon> <url\|name>` | Download content from a URL, or browse/install addons |
| `/ic exportapi` | Regenerate `plugins/ItemsCore/itemscore-api.json` (the API manifest) |
| `/itemeditor <item>` | Open the visual editor for an item |
| `/stats` | Create, edit and delete stats (or edit `stats.yml` + `/ic reload stats`) |
| `/ic rarities` | Manage rarities (display, order, stat & cost multipliers); items reference one via the `rarity` field and `{rarity}` lore |
| `/ic animations` | Build named particle animations in the GUI (shape picker, layers, colours, live test); play any from an item action with `particles.playAnimation(player, "name", ticks)` - no animation code needed |
| `/ic cosmetics` | Toggle blocking of vanilla cosmetic edits (leather dye, cauldron wash, armor trims, banner/firework/shield) on custom ItemsCore items only; all off by default |
| `/ic dupe` | Duplicate-item detection settings: enable/disable, auto-delete or wipe duped items, scan interval, alert cooldown, ender chest scan. Staff alerts need `itemscore.dupeflags`; `/toggledupealerts` mutes them, `itemscore.avoiddupe` exempts a player |
| `/addons` | Manage installed ItemsCore addons; `/ic updates` checks for addon updates |
| `/recipe [search]` | Player recipe book: browse custom-item crafting recipes (available to everyone) |
| `/equipment [player]` | EquipmentCore addon: open the equipment menu of extra wearable slots (works like armour while equipped); aliases `/eq`, `/equip` |
| `/ic equipment` | EquipmentCore admin menu (when installed): settings, types, slots, custom items/buttons, and the menu layout editor |

## When in doubt

- Ask the user what the item should look like (material, name) and what it should do, and on which interaction.
- Keep effects simple unless asked: a message, a heal, a teleport, a particle burst, lightning, potion effects.
- Always validate before delivering. Never claim an item works if you did not validate it.
