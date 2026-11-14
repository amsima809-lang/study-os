# Campus maps

- `ru-huamak.svg` — Ramkhamhaeng University, Hua Mak (main) campus.
- `ru-bangna.svg` — Bang Na campus.
- `maps.css` — takes the maps' colours from the app's theme.

Both are the app's own redrawings of the university's maps: the same buildings in the same
places, as plain shapes. South is at the top of the Hua Mak map, as on the university's.

## Using one

Put the SVG **inline** inside an element with class `campus-map` (an `<img>` cannot see the
theme's variables). Every building is a group with its code: `<g id="SSB" data-code="SSB">`,
with a `<title>` (its name) where the name could be read with certainty. To highlight a
building, add class `is-selected` to the polygon or rect inside its group.

The colours are CSS custom properties (`--map-building`, `--map-line`, `--map-ground`,
`--map-road`, `--map-green`, `--map-water`, `--map-plaza`, `--map-highlight`, `--map-label`…).
`maps.css` sets them from the theme tokens; each also has a fallback in the file, so the SVG
looks right opened on its own.

## Changing one

Hua Mak is generated: `scripts/maps/trace.cjs <image>` finds the coloured shapes on the
university's map and numbers them (`shapes.json`, `overlay.jpg`); `scripts/maps/build.cjs`
holds the table saying what each number is, and writes both SVGs. Edit the table or the
Bang Na drawing in `build.cjs`, then run `node scripts/maps/build.cjs`.

Not on the maps yet: the side gates, the toilets and cafeterias marked on the original, and
the Thai names of the buildings.
