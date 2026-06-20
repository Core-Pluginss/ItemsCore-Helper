---
name: itemscore
description: Build and edit custom Minecraft RPG items for the ItemsCore plugin. Use whenever the user wants to create a new item, change how an item behaves, add an ability or particle effect, or fix an ItemsCore item. The user runs a Minecraft server with ItemsCore installed; you produce a clean item JSON file they import in-game.
---

# ItemsCore item builder

ItemsCore is a Minecraft (Bukkit/Spigot) plugin that lets a server owner create fully custom RPG items without writing Java. You help the user build those items.

## The one rule that matters

Always produce a **clean item JSON** (the format described below). Never hand-write the plugin's internal item YAML or its generated JavaScript `code`. When the user imports your JSON, the plugin builds **both** the runnable code **and** the in-game GUI action graph from it. That means an item you create this way still works **and** stays fully editable in the in-game editor. Hand-writing raw code produces an item the GUI cannot open, which is exactly the problem this format avoids.

## Step 1: Get the API (do this first)

Use the real API instead of guessing method names.

Preferred - the `itemscore` MCP server. It runs locally on the user's machine (installed with `npx itemscore-helper`) and exposes these tools. If it is connected, call them:
- `search_methods(query, binding?, includeUseless?)` - find scripting methods by name, category, or description
- `get_method(name, binding?)` - full signature, params, return, and example for one method (accepts `core.teleport` or `teleport`)
- `list_triggers()` - every trigger an item can react to, and the variables available in each
- `list_events()` - custom events and the global variables (player, event, core, particles, ...)
- `get_item_schema()` - the full field reference for the clean item JSON
- `validate_item(item)` - checks an item JSON and returns errors and warnings
- `generate_item_template(kind?)` - a valid starter item (`basic` or `ability`)

Fallback - if no MCP is connected, a hosted copy is available over plain HTTP:
- MCP endpoint: `https://www.coredevelopment.shop/api/mcp`
- API manifest: `https://www.coredevelopment.shop/api/itemscore/manifest`
- Item schema: `https://www.coredevelopment.shop/api/itemscore/item-schema`
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
  "talisman": false,
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

Find the exact method you need with `search_methods` / `get_method` before using it. Do not invent method names.

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

Run `validate_item` on your JSON. Fix every entry under `errors` before continuing. `warnings` are usually fine (for example a Bukkit call the API cannot introspect), but read them.

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

## Command cheat sheet

| Command | What it does |
|---|---|
| `/ic import <file>` | Import a clean JSON from `plugins/ItemsCore/imports/` (live + GUI-editable) |
| `/ic export <item>` | Write an existing item to `plugins/ItemsCore/exports/<item>.json` |
| `/ic adopt <item>` | Make a legacy code-only item GUI-editable |
| `/ic reload [item]` | Reload all items, or one, and report success or errors |
| `/ic exportapi` | Regenerate `plugins/ItemsCore/itemscore-api.json` (the API manifest) |
| `/itemeditor <item>` | Open the visual editor for an item |

## When in doubt

- Ask the user what the item should look like (material, name) and what it should do, and on which interaction.
- Keep effects simple unless asked: a message, a heal, a teleport, a particle burst, lightning, potion effects.
- Always validate before delivering. Never claim an item works if you did not validate it.
