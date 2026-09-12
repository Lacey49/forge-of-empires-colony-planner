# Changes

## v0.100

### Fixes

- Undo no longer carries a different era's grid into the current colony. Switching between presets and Free Build also clears unrelated undo steps.
- An optimizer result no longer gets a free pass just because the current colony contains a later residence, goods, or life support. The credit comparison includes the current homes.
- Escape cancels a running optimizer search. Changing the chosen building clears the previous result.
- Optimizer results are checked for valid buildings, land, and connected paths before being offered.
- Backup imports survive the reload. The outgoing page can no longer save the old board over the imported backup.
- Unreadable saved data is preserved instead of immediately being overwritten by a blank workspace. Settings shows a recovery message.
- Backup imports check the layouts before replacing the current save.
- A broken preset view no longer deletes a valid Free Build save.
- Valid edits to a built-in preset survive reopening the era.
- Clear All explains that the Town Hall returns to its starting position. Its behavior is now defined in the main app instead of a separate replacement function.
- The apply-result message uses your chosen Undo shortcut.

### Cleanup

- Split the large HTML file into page markup, CSS, app code, and building/layout data.
- Replaced the script loader chain with ordered scripts in the page. Startup runs after the save fixes and current presets are ready.
- Renamed files such as `experimental.js` and `release-hardening.js` to describe what they do.
- Removed retired search functions, unused UI helpers, obsolete control hooks, duplicate building dimensions, and the extra script-loading fallback.
- Moved CSS-only fixes into the stylesheet and formatted the code consistently.
- Rewrote the README, backup labels, and optimizer explanations in plain language. Added a small coffee-button joke and left the important controls straightforward.

The existing building values and latest Titan corrections are retained. This is a code cleanup, not a fresh audit of the game's production values.
