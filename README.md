# Forge of Empires Colony Planner

[Open the planner](https://lacey49.github.io/forge-of-empires-colony-planner/)

I made this because moving a whole colony around in game just to find out one building won't fit gets old pretty fast.

Pick your era, add the expansions you own, and try a layout. You can place buildings yourself, start from a built-in preset, or use **Optimize** to look for a layout that earns more credits.

It covers Mars, Asteroid Belt, Venus, Jupiter Moon, Titan, and Space Hub. The planner saves in your browser. It doesn't connect to your game or move anything in it.

## Getting started

1. Click your era at the top.
2. Turn on the expansions you own. You can click them on the map or use the expansion controls.
3. Choose a building, then click an empty spot to place it. Buildings keep their in-game orientation.
4. Use **Check** to find buildings that need a connected path. Titan and Space Hub don't need paths.

**Presets** lets you try a ready-made layout. Your **Free Build** layout is saved separately, so you can switch back to it. To keep a layout as another preset, click **Save preset**.

## Controls

| What you want to do                     | How                                                                   |
| --------------------------------------- | --------------------------------------------------------------------- |
| Place a building                        | Pick it from the menu, then click the map                             |
| Pick from the current building category | Press `1` through `9`                                                 |
| Move a building or the Town Hall        | Press `M`, then pick it up and place it                               |
| Delete a building or path               | Right-click it, or press `Delete` to turn delete mode on              |
| Undo                                    | `Ctrl + Z`                                                            |
| Move around the map                     | Drag, or use the arrow keys                                           |
| Zoom                                    | Mouse wheel                                                           |
| Use the grid with a keyboard            | Tab to the grid, move with arrows, and press Enter to place or select |

You can change the Move and Undo shortcuts in Settings. When the grid has keyboard focus, arrows move between tiles instead of moving the map.

## What Optimize does

Choose the main residential building you want to use. The search tries different Town Hall positions, building placements, and paths. It can tuck smaller, earlier homes into leftover space.

The result has to earn more credits than your current layout before you can apply it. You get to see the result first. If it would remove goods or life support buildings, the planner lists those changes and asks before applying them.

The search is aimed at residential credit output. It doesn't balance goods production, spare colonists, or life support for you. The credit comparison uses the buildings' base output over the same time period.

It usually takes longer with more expansions or with paths to connect. The time shown is an estimate. You can cancel a search, and applying a result can be undone.

It finds good layouts, but it can't promise the best possible one. Colony Tetris still has hands.

## Keep a backup

Your layouts are saved in this browser on this device. Clearing browser data or switching browsers won't carry them over.

Open **Settings → Backups → Download** to save a copy of your layouts and presets. **Import** loads that file again. You can also restore the previous save or the save from before applying an optimizer result. Backups don't include your theme or keyboard settings.

## What's changed in v0.100

This update fixes save recovery, Undo across eras, and several optimizer dialog bugs. It also removes unused code and puts the files into folders that are easier to navigate.

[Read the changes](docs/changes.md) · [Find your way around the code](docs/working-on-the-planner.md)

## Found something broken?

[Open an issue](https://github.com/Lacey49/forge-of-empires-colony-planner/issues). Tell me which era you were using and what you clicked. A screenshot or a backup file helps, especially for layout problems.

If you'd like to support the project, there's a [Buy Me a Coffee page](https://buymeacoffee.com/lacey49). The planner is free either way.

This is a fan-made tool and isn't affiliated with InnoGames. Building images belong to their respective owners.
