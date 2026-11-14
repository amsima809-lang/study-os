# Brand

"StudyOS" and the old book icon were placeholders. This folder holds the logo work and the name research.

## What is live in the app

- **Logo: the book that becomes a tick** (`mark-book.svg`). It is in the app header, the sidebar and the login page (`client/src/components/Logo.tsx`), the browser tab (`client/public/favicon.svg`), and the home-screen and notification icons (`client/public/*.png`, built by `node scripts/make-icons.mjs`).
- **Name: still "StudyOS".** The name has not been chosen. It is kept in one place so that changing it is one command (below).

## Changing the name

```bash
node scripts/rename-app.mjs "Khuenjai" "ขึ้นใจ"   # Latin name, then the Thai form (optional)
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

## Names checked (14 November 2026)

24 names were searched on the App Store, Google Play, the web, domain records and public LINE IDs. Full results with links: `names.json`, shown in `brand-board.html`.

No similar product found: **Khuenjai (ขึ้นใจ)**, ThamEng (ทำเอง), Maenjai (แม่นใจ), Jammaen (จำแม่น), Nuekok (นึกออก), RianRod (เรียนรอด), Thuanly.

Already used by study apps: Jodjam (จดจำ), Tiwdee (ติวดี), PromSob (พร้อมสอบ), Khaojai (เข้าใจ), Termwise, Retainly, Semestra, Loopwise, Recallo.

Limits: Facebook, Instagram and TikTok were only seen through Google results; the Thai company registry and trademark database were not searched.

## Still to do once the name is chosen

- Run the rename command.
- Use that name's files from `lockups/` wherever the logo appears with the name (they are ready for all five shortlisted names).
- A proper trademark clearance, and the domain.
