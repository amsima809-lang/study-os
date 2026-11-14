# Brand

"StudyOS" and the old book icon were placeholders. This folder holds the logo work and the name research.

## The brand (chosen 14 November 2026)

- **Name: Upleaf.** An English name; the same in the Thai interface.
- **Logo: the book that becomes a tick** (`mark-book.svg`): an open book whose right page lifts — a leaf going up.
- **Colours: leaf green `#15803d` and lime `#a3e635`** (`BRAND` in `client/src/theme.ts`). Green is the app's default theme and its icon; lime is the lifted page. The earlier indigo is still offered as a colour theme.

Where it lives: `client/src/brand.ts` (name), `client/src/components/Logo.tsx` (mark, follows the theme), `client/public/favicon.svg` and the PNG icons (built by `node scripts/make-icons.mjs`), `lockups/upleaf-light.svg` and `upleaf-dark.svg` (logo with the name, lettering outlined).

Not done, and why:
- **Trademark clearance and the domain.** The checks here are product and register searches, not legal clearance. `upleaf.com` belongs to a web agency; `upleaf.app` did not resolve on the day.
- **Internal names stay `studyos`:** storage keys, notification tags, log prefixes, the repository, the Fly app, and most of these documents. Students never see them, and changing storage keys would sign everyone's settings away.

## Changing the name

```bash
node scripts/rename-app.mjs "Upleaf"               # one name for both languages
node scripts/rename-app.mjs "Khuenjai" "ขึ้นใจ"   # or a Latin name and its Thai form
npm run build
```

That updates everything a student sees: the header, every sentence that mentions the app, the page title, the installed-app name, notifications, and the lecture-collector's messages. It does not change internal identifiers (storage keys, notification tags, log prefixes), these documents, or the Fly app name.

Before a name goes public: search the Thai trademark office (DIP) and register the domain. The research below is not a trademark clearance.

## Logo with the name

`lockups/` holds the mark with the name beside it for each shortlisted name and for the current placeholder: `<name>-light.svg`, `<name>-dark.svg`, and `<name>-th-light.svg` / `<name>-th-dark.svg` for the Thai form. The lettering is converted to outlines, so the files need no font. How they are made: `tools/README.md`.

## Changing the logo

The other two marks are here as `mark-loop.svg` and `mark-cards.svg`, with app icons. To switch: replace the two paths in `Logo.tsx`, copy the matching icon over `client/public/favicon.svg`, put the new paths in `scripts/make-icons.mjs` and run it.

Rules for the mark: one colour (it takes the theme's colour), never below 16 pixels, and the lifted page may take the theme's second colour.

## English names in the running (14 November 2026)

The owner asked for an English name and likes three. What quick checks of the App Store (US and Thailand), Google Play and domain records found:

| Name | In the way | Risk |
|---|---|---|
| **Upleaf** | A posture-walking app on the App Store and a web agency at upleaf.com. Nothing in study or education. upleaf.app is free. | Lowest. It also describes the logo: a page lifting up. |
| **Termwise** | An app with this exact name on Google Play: school-management software for Nigerian schools, very few downloads. termwise.com is for sale. | Medium. Same name, same broad field, on one of the two stores. |
| **Semstra** | Nothing under this spelling. But Semestra, one letter longer and said the same way, is three semester-planner apps on both stores, including in Thailand. | Highest. Students searching by ear would find the others. |

Logo-with-name files for all three are in `lockups/`.

## If Upleaf has to change: checked English fallbacks

A wider check of 32 more English names (App Store US and Thailand, Google Play, web, domains; no trademark register) found none of the first twenty free. Among them: Flyleaf, Dogear, Recto, Byheart, Kenwise (a Thai exam-prep course), Swotly and Stickwise are all existing study or notes products. Six newly coined names had no similar product:

1. **Gradetick** — nothing found anywhere; both domains unregistered.
2. **Owntick** — fits "AI never does it for me"; sound-alikes OneTick and Donetick.
3. **Termtick** — only a hobby GitHub project; close to the TickTick brand.
4. **Heartpen** — only personal handles; the .com is for sale.
5. **Acetick** — reads like "acetic".
6. **Hearttick** — awkward double t.

The same check rated Upleaf "in use elsewhere, not in education": the web agency, the posture-walking app, and an AI studio it reported at upleaf.io (that site would not load when checked directly, so this is unverified).

## Names checked (14 November 2026)

24 names were searched on the App Store, Google Play, the web, domain records and public LINE IDs. Full results with links: `names.json`, shown in `brand-board.html`.

No similar product found: **Khuenjai (ขึ้นใจ)**, ThamEng (ทำเอง), Maenjai (แม่นใจ), Jammaen (จำแม่น), Nuekok (นึกออก), RianRod (เรียนรอด), Thuanly.

Already used by study apps: Jodjam (จดจำ), Tiwdee (ติวดี), PromSob (พร้อมสอบ), Khaojai (เข้าใจ), Termwise, Retainly, Semestra, Loopwise, Recallo.

Limits: Facebook, Instagram and TikTok were only seen through Google results; the Thai company registry and trademark database were not searched.

## Preliminary trademark-register search, Thai names (14 November 2026)

A word-mark search of Thailand's DIP register (search.ipthailand.go.th), TMview with office = Thailand, and WIPO's Global Brand Database. ASEAN TMview could not be reached, so it was not searched. This is not legal clearance, and it finds word marks only (a logo with the word drawn in it would not show up).

| Name | Result |
|---|---|
| Khuenjai / ขึ้นใจ | No identical mark. Nearest: the ชื่นใจ / CHUENJAI family, one consonant away, none live in classes 9, 41 or 42; and "KJ, KWANJAI, BY BUILK" pending in classes 9 and 42 (app 260156386). |
| ThamEng / ทำเอง | No standalone mark. The words appear inside five longer marks in food, banking and restaurant classes (29, 30, 36, 43). |
| Maenjai / แม่นใจ | No identical mark. The near-word มั่นใจ appears only inside slogans in classes 9, 41 and 42 (for example a tutoring school's "ยิ่งพร้อม ยิ่งมั่นใจ ในทุกสนามสอบ", reg 241128909). |
| Jammaen / จำแม่น | Nothing found. |
| Nuekok / นึกออก | Nothing found. |

Records can be opened by number at `https://search.ipthailand.go.th/search?q=<number>&tab=trademark`. WIPO rate-limited part of the run, so the spaced spellings of the last three names were not searched there.

## Changing the colours

Change `BRAND` in `client/src/theme.ts`, recompute the accent tokens in `client/src/index.css` (the note above them says how), update `GREEN` and `LIME` in `scripts/make-icons.mjs` and run it, copy the new icon over `client/public/favicon.svg`, and set `theme-color` in `client/index.html` and `theme_color` in `client/vite.config.ts`.
