# Working on the planner

This is a plain HTML, CSS, and JavaScript site. There's no app build step. GitHub Pages serves the files as they are.

## Where things live

| Folder or file                            | What's in it                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `index.html`                              | The page, buttons, labels, and script loading order                      |
| `styles/planner.css`                      | Colors, spacing, the board, and smaller-screen layouts                   |
| `app/planner.js`                          | Placing and moving buildings, the grid, saved layouts, and settings      |
| `app/backups.js`                          | Browser saves, backup downloads, and restoring a backup                  |
| `app/expansions.js`                       | Keeping buildings and the Town Hall on owned land when expansions change |
| `app/keyboard.js`, `app/accessibility.js` | Escape handling and keyboard access to the grid                          |
| `app/start.js`                            | Opens the app after the other files have loaded                          |
| `data/buildings.js`                       | Building names, sizes, images, and production values                     |
| `data/layouts.js`                         | Colony land, preset coordinates, and era appearance                      |
| `data/titan-land.js`                      | Titan's corrected starting land and expansions                           |
| `data/titan-save-migration.js`            | Updates older Titan saves to the corrected building sizes                |
| `optimizer/`                              | The search, its time limit, and the result dialog                        |
| `presets/`                                | Built-in layouts, grouped by era                                         |
| `assets/`                                 | Building images, icons, and the web app manifest                         |
| `tests/`                                  | Code, building size, preset, and browser checks                          |
| `docs/`                                   | These notes and the change list                                          |

The verification HTML file, `robots.txt`, `sitemap.xml`, and `favicon.ico` stay at the root because their URLs are used by the website and search engines.

Some older names remain inside saved data, including the storage key `foe-colony-optimizer-workspace-v2`. Don't rename that just to make it prettier. Existing players' saves depend on it.

## Run it locally

From the project folder, start a local server:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Run the checks

Install Node.js 20 or newer, then run:

```sh
npm ci
npx playwright install chromium
npm test
```

On Linux, Playwright may need system packages. `npx playwright install --with-deps chromium` installs those too.

`npm run test:static` checks the scripts, missing files, and building dimensions. `npm run test:browser` opens the planner in Chromium and checks presets, paths, expansion changes, Undo, backups, and optimizer behavior. It runs a real search, so give it a little time.

The browser test starts its own local server. For a separately installed Chromium, set `BROWSER_EXECUTABLE_PATH` to its executable. Screenshots go to the system temporary folder, or `PLANNER_SCREENSHOT_DIR` if set.

`npm run format` makes indentation and spacing consistent. None of these packages are needed by people using the website.

## A few things that are easy to break

- Sizes are width × height. Coordinates are `[row, column]`.
- All script files share the browser's global scope. Keep their order in `index.html`, with startup last.
- Buildings and the grid must agree about occupied tiles. Changing only one can make a layout look right but fail when reloaded.
- A browser reload fires `pagehide`. Backup restoration pauses normal saving so the outgoing page can't overwrite the imported layout.
- Undo belongs to the current era and layout. Clear its history when switching to a different one.
- The optimizer compares credits over eight hours internally. Its displayed four-hour figure uses the same rate for comparison, including homes collected every eight hours.
- Preset names describe the main residential building and its count. Smaller filler homes don't belong in the title.
- Keep old-save migrations until there's a deliberate plan for the saves they support.

Before calling an update live, check that the GitHub Pages deployment finished successfully.
