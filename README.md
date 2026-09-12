<div align="center">

<img src="./assets/favicon-192x192.png" width="96" height="96" alt="Forge of Empires Colony Planner icon">

# Forge of Empires Colony Planner

Plan Space Age colonies without rebuilding the same layout five times in-game.

[![Open Planner](https://img.shields.io/badge/Open-Colony%20Planner-brightgreen?style=for-the-badge)](https://lacey49.github.io/forge-of-empires-colony-planner/)
[![Current Build](https://img.shields.io/badge/Current%20Build-v0.1-c47a21?style=for-the-badge)](https://github.com/Lacey49/forge-of-empires-colony-planner)
[![Release Checks](https://img.shields.io/github/actions/workflow/status/Lacey49/forge-of-empires-colony-planner/release-check.yml?branch=main&label=Release%20Checks&style=for-the-badge)](https://github.com/Lacey49/forge-of-empires-colony-planner/actions/workflows/release-check.yml)

### [Open the Colony Planner](https://lacey49.github.io/forge-of-empires-colony-planner/)

</div>

---

## What is it?

Planning a colony inside Forge of Empires can turn into a lot of moving buildings, rebuilding paths, and then finding out the last home misses by one tile. I made this planner so you can work out the layout first and only rebuild it once in the game.

Choose your Space Age, turn on the expansions you own, and build the colony on the map. You can make a layout from scratch, load a built-in preset, or use **Optimize** to search for a residential layout that earns more credits.

The planner runs entirely in your browser and saves your layouts on that device. It does not connect to your Forge of Empires account or make any changes in the game.

| Era | Colony |
| --- | --- |
| **SAM** | Space Age Mars |
| **SAAB** | Space Age Asteroid Belt |
| **SAV** | Space Age Venus |
| **SAJM** | Space Age Jupiter Moon |
| **SAT** | Space Age Titan |
| **SASH** | Space Age Space Hub |

## What you can do

- Build with the real colony shapes, expansion areas, and non-rotatable building sizes.
- Move the Town Hall, buildings, and paths without risking your in-game colony.
- Start with built-in layouts or save your own presets.
- Keep a separate **Free Build** layout while trying presets.
- Search for higher-credit residential layouts with **Optimize**.
- Check whether every building that needs a path is actually connected.
- Undo changes, adjust the map view, and keep the same zoom and position between eras.
- Download a backup of your layouts and restore it later.

## Getting started

1. Click your era at the top.
2. Turn on the expansions you own. Click them on the map or use the expansion controls.
3. Pick a building, then click an empty spot to place it. Buildings stay in their real in-game orientation.
4. Use **Check** to find buildings that need a connected path. Titan and Space Hub do not use paths.

Open **Presets** to try a ready-made layout. Your **Free Build** layout is saved separately, so switching to a preset does not wipe it. Click **Save** if you want to keep the layout currently on the map as a custom preset.

## Controls

| What you want to do | How |
| --- | --- |
| Place a building | Pick it from the menu, then click the map |
| Pick from the current building category | Press `1` through `9` |
| Move a building or the Town Hall | Press `M`, then pick it up and place it |
| Delete a building or path | Right-click it, or press `Delete` to turn delete mode on |
| Undo | `Ctrl + Z` |
| Move around the map | Drag, or use the arrow keys |
| Zoom | Mouse wheel |
| Use the grid with a keyboard | Tab to the grid, move with the arrow keys, and press Enter to place or select |

The Move and Undo shortcuts can be changed in Settings. When the grid itself has keyboard focus, the arrow keys move between tiles instead of moving the whole map.

## How Optimize works

Choose the main residential building you want the optimizer to use. It tests different Town Hall positions, building placements, and path layouts. It can also fit smaller, earlier homes into leftover spaces when that raises the total credit output.

Nothing on your map changes while it searches. A result must earn more credits than your current layout before the planner offers it, and you still choose whether to apply it. If the result would remove goods or life support buildings, the planner lists those changes and asks first.

The optimizer focuses on residential credit output. It does not balance goods production, spare colonists, or life support for you. Larger colonies and eras that need paths usually take longer to search, so the time shown is an estimate.

It finds strong layouts, but it cannot prove that no better layout exists. Colony Tetris still has hands.

## Backups and saved layouts

Your layouts are saved in the browser on the device you are using. Clearing that browser's data, using another browser, or moving to another computer will not bring them along automatically.

Open **Settings → Backups → Download** to save a copy of every layout and custom preset. **Import** loads that file again. The planner can also restore the previous save or the save made before an optimizer result was applied.

Backup files do not include your theme or keyboard settings.

## Current build: v0.1

This update fixes save recovery, Undo across eras, saved preset edits, and several optimizer problems. It also removes retired code and organizes the project into folders that are much easier to follow.

[![Read the Changes](https://img.shields.io/badge/Read-the%20Changes-6f42c1)](./docs/changes.md)
[![Code Guide](https://img.shields.io/badge/Code-Folder%20Guide-2475ca)](./docs/working-on-the-planner.md)
[![Report a Bug](https://img.shields.io/badge/Report-a%20Bug-d73a49)](https://github.com/Lacey49/forge-of-empires-colony-planner/issues)

## Found something broken?

[Open an issue](https://github.com/Lacey49/forge-of-empires-colony-planner/issues) and tell me which era you were using and what you clicked. A screenshot or planner backup helps a lot with layout problems.

## Support the planner

The planner is free. If it has saved you from playing colony Tetris for the sixth time and you want to support it:

<h3><a href="https://buymeacoffee.com/lacey49"><img src="./assets/ui/buy-me-a-coffee.svg" width="28" height="28" align="middle" alt=""> Buy Me a Coffee</a></h3>

---

<div align="center">

This is a fan-made tool and is not affiliated with InnoGames.

</div>
