# Brand tools

- `build-board.py` — rebuilds `../brand-board.html` from the marks, `../lockups/` and `../names.json`. Run from `docs/brand`: `python3 tools/build-board.py`.
- `lockups.cjs` + `outline.cjs` — make the logo-with-name files with the lettering converted to outlines. They shape the text properly (HarfBuzz), so Thai vowels and tone marks sit where they should.

The lockup tool needs two packages that are deliberately NOT project dependencies. Install them in a scratch folder next to a copy of the two scripts:

```bash
mkdir /tmp/lockup && cp docs/brand/tools/*.cjs /tmp/lockup && cd /tmp/lockup
npm init -y && npm install harfbuzzjs @fontsource/ibm-plex-sans-thai-looped
node lockups.cjs /path/to/study-os/docs/brand/lockups "Khuenjai|ขึ้นใจ"
```

The typeface is IBM Plex Sans Thai Looped (SIL Open Font License), the same one the app uses.
