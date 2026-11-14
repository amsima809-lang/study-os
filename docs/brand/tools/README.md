# Brand tools

- `cairn-books.cjs` — draws the logo mark. It writes `../mark-cairn.svg`, `../mark-cairn-small.svg`, the cairn sketches, and `client/src/components/logoPaths.ts` for the app. No packages needed: `node docs/brand/tools/cairn-books.cjs`, then `node scripts/make-icons.mjs`.
- `build-board.py` — rebuilds `../brand-board.html` from the marks, `../lockups/` and `../names.json`. Run from `docs/brand`: `python3 tools/build-board.py`.
- `lockups.cjs` + `outline.cjs` — make the logo-with-name files with the lettering converted to outlines. They shape the text properly (HarfBuzz), so Thai vowels and tone marks sit where they should.
- `logo-compare.cjs`, `side-by-side.cjs` — the comparison sheets in `../sketches/` (marks as app icons, at small sizes, and beside the name). They use `outline.cjs` and the server's `sharp`, and hold the paths of the machine they were written on; adjust before running.

The lockup tool needs two packages that are deliberately NOT project dependencies. Install them in a scratch folder next to a copy of the scripts:

```bash
mkdir /tmp/lockup && cp docs/brand/tools/*.cjs /tmp/lockup && cd /tmp/lockup
npm init -y && npm install harfbuzzjs @fontsource/ibm-plex-sans-thai-looped
MARK_SVG=/path/to/study-os/docs/brand/mark-cairn.svg node lockups.cjs /path/to/study-os/docs/brand/lockups "Termtrail"
```

The typeface is IBM Plex Sans Thai Looped (SIL Open Font License), the same one the app uses.
