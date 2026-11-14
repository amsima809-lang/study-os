# Brand

"StudyOS" and the old book icon were placeholders. This folder holds the logo work and the name research.

## The brand (chosen 14 November 2026)

- **Name: Termtrail.** English; the same in the Thai interface. "เทอม" (term) is the everyday Thai word for semester.
- **Logo: the book that becomes a tick** (`mark-book.svg`).
- **Colours: indigo with an amber page on the logo** (`BRAND` in `client/src/theme.ts`; the icon tile is `#4f46e5`, the page `#fbbf24`). Leaf green is offered as the "Forest" colour theme.

Still to do for the name: a trademark professional's opinion (`trademark-brief.md` is ready to hand over) and the domains (`termtrail.com` and `termtrail.app` were unregistered on the day).

Names tried and dropped, and why:

| Name | Dropped because |
|---|---|
| Upleaf | Chosen, then dropped the same day: "leaf" reads as cannabis (the closest US mark, UPLEAF'D, is a cannabis-information site). Search record: `trademark-brief-upleaf.md`. |
| Semstra | One letter from Semestra, three existing semester-planner apps. It would look like a knock-off trading on a misspelling. |
| Semestra | Those three apps, plus an unregistered AI study app of the same name. |
| Termwise | An app of this exact name on Google Play (school management, Nigeria); an identical mark pending in Spain for software. |
| Termleaf | A live writing tool at termleaf.com ("Write. Nothing else."), and the same "leaf" association. |

In-depth check of the owner's idea and two alternatives (app stores, web, and the trademark registers of Thailand, the US, the EU, Australia and WIPO; not TMview, the UK or Switzerland):

| Name | Result |
|---|---|
| **Astute** | Taken. An education app named exactly "Astute" is on Google Play (school management, 10K+ installs, listed in the Thai store). Several other education products use the word, and about 76 live ASTUTE marks sit in classes 9, 41 and 42 worldwide, including test-prep and tutoring marks in the US, Malaysia, India and the UK. Nothing educational in Thailand. astute.app is for sale at US$35,000. |
| **AstuteU** | No product and no register hits, and all three domains are unregistered. But store search folds it into the "Astute" results, so it still looks derivative. |
| **Termtrail** | The cleanest: no app, no register hits, domains unregistered. Small unrelated uses exist: an AI workspace for freelancers at termtrail.online (since Aug 2026), a dormant flashcards project on GitHub, and empty social handles. "Trail" is easy to mistype as "trial". |

A first screen (app stores and domains only) of 25 more "term" and "semester" names found most taken or parked. No app and no .com or .app in use: Termtrail. No app, one domain in use: Termnest, Termrise, Termpath, Semwell, Semwise, Semly, Semnest. Already study apps: Termflow, Semora, Gradewise, Planwise.

Where the brand lives: `client/src/brand.ts` (name), `client/src/components/Logo.tsx` (mark, follows the theme), `client/public/favicon.svg` and the PNG icons (built by `node scripts/make-icons.mjs`), `lockups/` (logo with a name, lettering outlined).

Internal names stay `studyos` whatever the brand becomes: storage keys, notification tags, log prefixes, the repository and the Fly app.

## Changing the name

```bash
node scripts/rename-app.mjs "NewName"              # one name for both languages
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

## Preliminary trademark-register search, English names (14 November 2026)

A word-mark search of Thailand's DIP register and WIPO's Global Brand Database (worldwide, and filtered to Thailand). TMview and ASEAN TMview could not be reached this time, and the US, EU and UK offices were only seen through WIPO's copy of their data. This is not legal clearance.

| Name | Result |
|---|---|
| **Upleaf** (chosen, then dropped) | Nothing identical in Thailand. One identical mark elsewhere: "upleaf" registered in Indonesia in class 9 for fibre-optic cable (reg. IDM001225641), not software. Similar marks: UpLeap (Switzerland, classes 9, 41, 42), UPLEAD (US, class 42), and Thai UPLIFT / UPLIFE marks. |
| Termwise | Nothing in Thailand. Identical mark pending in Spain in class 9 for downloadable software (app. M4407002, filed 5 Oct 2026); "Balthasar TermWise" registered in the UK in class 9. |
| Semstra | Nothing found under this spelling. "Semestra": only a dead 1981 US application, but an unregistered study app of that name exists. "SEMESTER" is registered in the UK and EU in classes 9 and 41, once by a student-planner company. |

The Indonesian record: https://branddb.wipo.int/en/similarname/brand/ID502023DID110042. Thai records open by number at `https://search.ipthailand.go.th/search?q=<number>&tab=trademark`.

Registers that could not be searched, and why (tried again the same day, by direct request and in a browser):
- **TMview** (tmdn.org) answers this machine with EUIPO's "Problem detected" / "Request Rejected" page, which is its automated-access protection. It has to be searched by a person in an ordinary browser: https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=upleaf
- **ASEAN TMview** (asean-tmview.org) refused every connection.

The Thai-name search above was also partial at WIPO (it rate-limited). That was not taken further because the owner chose an English name.

Since TMview was closed to automated access, the national offices were then searched directly: no identical Upleaf mark at the USPTO, EUIPO or IP Australia; the Indonesian fibre-optic-cable registration was confirmed on Indonesia's own register; and WIPO's Madrid Monitor shows no international registration for the Swiss UpLeap mark, so no sign it reaches Thailand. The UK office blocked the search and the Swiss register was down. The three leftover WIPO queries for the Thai names ("Maen Jai", "Jam Maen", "Nuek Ok") found nothing. Full table: `trademark-brief-upleaf.md`.

What a lawyer should look at for Upleaf: whether the Swiss UpLeap mark (same three classes, one letter different) or the Indonesian class 9 registration could be raised against it, and a proper search of TMview, which was not reachable here.

## Checked English fallbacks

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

Change `BRAND` in `client/src/theme.ts`, recompute the accent tokens in `client/src/index.css` (the note above them says how), update `TILE` and `PAGE` in `scripts/make-icons.mjs` and run it, copy the new icon over `client/public/favicon.svg`, and set `theme-color` in `client/index.html` and `theme_color` in `client/vite.config.ts`.
