<div align="center">

<img src="./assets/favicon-192x192.png" width="96" height="96" alt="Forge of Empires Colony Planner icon">

# Forge of Empires Colony Planner

Plan Space Age colonies before rebuilding them in-game.

[![Open Planner](https://img.shields.io/badge/Open-Colony%20Planner-brightgreen?style=for-the-badge)](https://lacey49.github.io/forge-of-empires-colony-planner/)
[![Current Build](https://img.shields.io/badge/Current%20Build-v0.1-c47a21?style=for-the-badge)](https://github.com/Lacey49/forge-of-empires-colony-planner)
[![Release Checks](https://img.shields.io/github/actions/workflow/status/Lacey49/forge-of-empires-colony-planner/release-check.yml?branch=main&label=Release%20Checks&style=for-the-badge)](https://github.com/Lacey49/forge-of-empires-colony-planner/actions/workflows/release-check.yml)

### [Open the Colony Planner](https://lacey49.github.io/forge-of-empires-colony-planner/)

</div>

---

## What is it?

Testing colony layouts in-game is a pain. You move half the colony, run out of room, and then have to put everything back. I made this so I could figure out the layout first.

Choose your era and expansions, then build from scratch, load a preset, or use **Optimize** to look for a higher-credit layout. Everything stays in your browser. The planner does not connect to your FoE account or change anything in-game.

| Era | Colony |
| --- | --- |
| **SAM** | Space Age Mars |
| **SAAB** | Space Age Asteroid Belt |
| **SAV** | Space Age Venus |
| **SAJM** | Space Age Jupiter Moon |
| **SAT** | Space Age Titan |
| **SASH** | Space Age Space Hub |

## What it has

- All six Space Age colonies, with their real land and building sizes
- Free Build, built-in presets, and custom saved presets
- Movable Town Halls, paths, expansions, Undo, zoom, and pan
- A credit optimizer and a path checker
- Local saving, backup downloads, and recovery options

## Getting started

1. Click your era at the top.
2. Turn on the expansions you own.
3. Pick a building and click the map to place it. Buildings do not rotate.
4. Use **Check** to find buildings that need a connected path. Titan and Space Hub do not use paths.

Your **Free Build** layout is saved separately when you try a preset. Click **Save** to keep the layout on the map as a custom preset.

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

Move and Undo can be rebound in Settings.

## How Optimize works

Pick the residential building you want to focus on and start the search. The optimizer tries different Town Hall positions, homes, filler buildings, and paths. It only offers a result if it finds more credit output than your current layout.

It does not balance goods, population, or life support. If a result removes one of those buildings, the planner warns you before applying it. It finds good layouts, not guaranteed perfect ones. Colony Tetris still has hands.

## Backups and saved layouts

Layouts are saved in your browser on that device. Use **Settings → Backups → Download** if you want a copy you can keep or move elsewhere. Backups include layouts and presets, but not your theme or shortcuts.

## Current build: v0.1

This update fixes several save, Undo, preset, and optimizer bugs. It also clears out old code and reorganizes the project folders.

[![Read the Changes](https://img.shields.io/badge/Read-the%20Changes-6f42c1)](./docs/changes.md)
[![Code Guide](https://img.shields.io/badge/Code-Folder%20Guide-2475ca)](./docs/working-on-the-planner.md)
[![Report a Bug](https://img.shields.io/badge/Report-a%20Bug-d73a49)](https://github.com/Lacey49/forge-of-empires-colony-planner/issues)

## Found something broken?

[Open an issue](https://github.com/Lacey49/forge-of-empires-colony-planner/issues) and tell me the era and what went wrong. A screenshot or backup helps.

## Support the planner

The planner is free. If it helped and you want to support it:

<h3><a href="https://buymeacoffee.com/lacey49"><img src="./assets/ui/buy-me-a-coffee.svg" width="28" height="28" align="middle" alt=""> Buy Me a Coffee</a></h3>

---

<div align="center">

This is a fan-made tool and is not affiliated with InnoGames.

</div>
