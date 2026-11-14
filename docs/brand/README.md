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

## Changing the logo

The other two marks are here as `mark-loop.svg` and `mark-cards.svg`, with app icons. To switch: replace the two paths in `Logo.tsx`, copy the matching icon over `client/public/favicon.svg`, put the new paths in `scripts/make-icons.mjs` and run it.

Rules for the mark: one colour (it takes the theme's colour), never below 16 pixels, and the lifted page may take the theme's second colour.

## Names checked (14 November 2026)

24 names were searched on the App Store, Google Play, the web, domain records and public LINE IDs. Full results with links: `names.json`, shown in `brand-board.html`.

No similar product found: **Khuenjai (ขึ้นใจ)**, ThamEng (ทำเอง), Maenjai (แม่นใจ), Jammaen (จำแม่น), Nuekok (นึกออก), RianRod (เรียนรอด), Thuanly.

Already used by study apps: Jodjam (จดจำ), Tiwdee (ติวดี), PromSob (พร้อมสอบ), Khaojai (เข้าใจ), Termwise, Retainly, Semestra, Loopwise, Recallo.

Limits: Facebook, Instagram and TikTok were only seen through Google results; the Thai company registry and trademark database were not searched.

## Still to do once the name is chosen

- Run the rename command.
- Convert the wordmark's letters to outlines and save the logo with the name beside it (needs the font files, which are not in the repo).
- Trademark search and domain.
