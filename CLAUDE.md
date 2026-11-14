# CLAUDE.md — StudyOS project rules

Personal, single-user, mobile-first study system for a Bachelor of Business
Administration in Marketing at Ramkhamhaeng University.
Starts semester 2/2569 (Nov 2026), target graduation ~Oct 2573.

## Working rules (do not break these)
1. Work in **phases**. At the end of each phase: run build + typecheck + tests,
   explain changes in plain Thai (like the reader is 12), then **STOP and wait
   for approval** before the next phase.
2. Before writing code in a phase, show a short plan (< 15 lines).
3. Never invent university facts. All course data comes from the prompt's SEED
   DATA. If something is missing, add a `TODO` and ask — do not guess.
4. Keep the codebase small and readable. No unnecessary libraries.
5. Zero TypeScript errors at every phase end.
6. UI text in **Thai**. Code, comments, commit messages in English.
7. Keep this file and `docs/ARCHITECTURE.md` updated at the end of every phase.
8. Commit to git at the end of every phase with a clear message.

## Core principle: AI helps me PRACTICE, never does it FOR me
- AI only: simplify content, ask questions, grade answers.
- Quiz answers stay hidden until the student submits their own answer.
- Every AI summary/question references the note it came from.
- Info not in the note is labeled `[นอกโน้ต — ตรวจกับตำราก่อน]`.
- Show the banner "AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก" on AI output.

## Stack
- Client: React 19 + Vite + TypeScript + Tailwind CSS v4. Mobile-first, PWA.
- Server: Express 5 + TypeScript, run with `tsx`.
- DB: SQLite (better-sqlite3), migrations as plain SQL files.
- AI: Anthropic SDK, all calls through `server/src/ai.ts`. Model + key from env.
- Timezone: `Asia/Bangkok`. Store ISO dates; display พ.ศ. in the UI.
- Deploy: Fly.io (Singapore), persistent volume at `/data`.
- i18n: in-house, no library. Dictionary in `client/src/i18n.tsx`, `useT()` hook,
  TH (default) / EN toggle, choice saved in localStorage. Course names ARE
  bilingual: `<CourseTitle>` shows "(CODE) primary" + the other language faint,
  switching with the UI language. name_en values in `seed.ts` are the OFFICIAL
  RU catalog names (provided by the student).
- Seed = full official catalog (87 courses, including ones not in the plan) with
  `choose_group` ("pick N of" groups in the `course_groups` table). The plan is
  the courses that carry a `term` (+ elective/free placeholders) = 132 credits.
- Notes input: type, OR a full drawing pad (HandwritingPad — pen / translucent
  highlighter / eraser, 5 colors, 3 widths, undo/redo, clear, zoom 50–400%,
  expand, add/remove page (1–10, non-destructive); vector strokes exported as one JPEG),
  plus separate camera / gallery photo buttons.

## Commands (run from repo root)
| Command | What it does |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | Run server (:3100) + client (:5180) together |
| `npm run build` | Build the client + typecheck the server |
| `npm run typecheck` | Type-check both workspaces (must be 0 errors) |
| `npm test` | Run server tests (vitest) |
| `npm run seed` | Load seed data into the database |
| `npm start` | Run the server in production mode (serves built client) |
| `fly deploy` | Deploy to Fly.io — see `docs/DEPLOY.md` |

## Folder map
```
study-os/
├── client/            # React app (the screens on the phone)
│   ├── src/           #   main.tsx, App.tsx, index.css
│   ├── index.html
│   └── vite.config.ts # dev server + /api proxy to backend
├── server/            # Express backend (the brain)
│   ├── src/           #   index.ts (routes), env.ts, ai.ts, seed.ts
│   ├── migrations/    #   plain .sql files that build the DB tables
│   └── test/          #   vitest tests
├── data/              # runtime data (git-ignored)
│   ├── uploads/       #   uploaded note photos
│   ├── backups/       #   daily SQLite backups
│   └── studyos.db     #   the SQLite database
├── docs/              # ARCHITECTURE.md, DEPLOY.md (Thai, simple)
├── .env.example       # copy to .env and fill in
└── CLAUDE.md          # this file
```

## Phase status
- [x] Phase 0 — Setup
- [x] Phase 1 — Database + Seed (+ TH/EN language switch)
- [x] Phase 2 — Today + Schedule
- [x] Phase 3 — Notes → AI Summary
- [x] Phase 4 — Quiz Me + Grading
- [x] Phase 5 — Flashcards (spaced repetition)
- [x] Phase 6 — Tracker & Analytics
- [x] Phase 7 — Degree Planner
- [x] Phase 8 — Mock Exam Mode
- [x] Phase 9 — PWA + Deploy
- [x] Phase 10 — Document Upload + Quiz from Real Content (materials, chapters, OCR, past exam parsing, enhanced quiz)
- [x] Phase 11 — SM-2 Spaced Repetition + Confidence Tracking + Weakness Summary
- [x] Phase 12 — Study Planner (backward scheduling from exam dates, daily tasks, auto-reschedule, ICS export)
- [x] Phase 13 — Mock Exam Upgrade (full-screen, question grid, flags, auto-save, per-question timing, custom grade cutoffs, chapter scores, history + trend graph)
- [x] Phase 14 — GPA/Credit Tracking (cumulative + per-term GPA, grade picker per course, graduation pace warning, "what if" GPA calculator, editable grade scale)
- [x] Phase 15 — Multi-User (users table, Google OAuth + dev login, per-user data isolation via user_id on all user-owned tables, per-user settings via user_settings table, legacy user migration)
- [x] Phase 16 — Multi-Program Catalog + Onboarding (faculties, programs, program_credit_requirements, program_courses tables; onboarding flow with faculty/program/year/term; per-user program-based course filtering; dynamic credit requirements from DB)
- [x] Phase 17 — Schedules + Exams for All BBA Programs (207 class sessions + 206 exam dates for semester 2/2569 from มร.30 and exam schedule PDFs; all 9 programs' courses with lecture times and exam dates)
- [x] Phase 18 — E-Testing Data (etesting_courses + etesting_schedule tables; 134 courses available for e-Testing semester 2/2569; schedule with registration/exam dates, centers, time slots; /api/etesting endpoint filters by user's program)
- [x] Phase 19 — Calendar Enhancements + Cost Calculator (custom events CRUD with add/delete in calendar; e-Testing exam period shown as amber dots; notes support; RU fee structure table; interactive cost calculator with semester breakdown and graduation projection; campus toggle central/regional; sliders for courses/credits/e-Testing/retake)
- [x] Phase 20 — AI Premium (฿99/month) + Modern Design (subscriptions table; every AI path gated by `checkAiSubscription`/`hasAiSubscription` — quiz, grading, course summary, chapter suggest, exam parsing; note auto-summary and OCR silently skipped for free users; PaywallModal + SubscriptionProvider; gradient/glass login with collapsible dev login; refreshed design tokens; quiz/mock setup keeps errors visible). NOTE: `/api/subscription/activate` has no real payment yet — TODO payment gateway before launch
- [x] Phase 21 — University Login Themes (login page "choose your university" picker, searchable TH/EN; 35 universities in Bangkok + Chiang Mai areas from `docs/research/*.json`, high-confidence entries only → generated `client/src/data/universities.ts`; page recolours to the school colours; 12 have a campus photo in `client/public/campus/` with on-page credit, see `docs/PHOTO_CREDITS.md`; choice saved in localStorage `studyos.university`; no logos/emblems; most hex values are approximations and are labelled so)
- [x] Phase 22 — University at Onboarding (onboarding asks university first, preselected from the login theme; `user_profiles.university_id` via migration 022, existing onboarded users backfilled to `ru`; only `ru` has a catalogue, so other universities skip faculty/program and get no timetable, exams or study-plan courses — `hasCatalog()` in `server/src/api.ts`; `/api/auth/me` returns `university_id` and the client copies it to localStorage so the login theme follows the account; programs listed in the faculty's official order)
- [x] Phase 23 — Timetable + Exams by Program (class sessions, exam lists, study-plan courses and mock-exam availability now show only courses in the student's program via `programFilter()` in `server/src/api.ts`; accounts with no program stay unfiltered)
- [x] Phase 24 — New-Database Seeding Fix (startup seeds when `plan_terms` is empty via `needsSeed()`, not when `courses` is empty — migration 017 adds courses first, so new databases were never seeded; `seedDatabase(db, { reset: false })` adds seed rows beside migration data without deleting, fills room/teacher on existing 2/69 classes, and maps the seed courses to Marketing; `npm run seed` still resets. Migration 023 defines ACC1101 + ACC1102 (Accounting-only core courses) from the RU admission guide)
- [x] Phase 25 — Custom Main Menu + Theme in More (`client/src/destinations.tsx` is the single list of all 12 screens; the main nav is the student's own list, saved in localStorage `studyos.nav`, default Today/Notes/Quiz/Review, at most 5 plus More; "+" on a More row pins it to the nav, or when the nav is full opens a sheet to choose which item it replaces; press-and-hold or right-click a nav item opens a sheet to move it back to More; More also has a Light/Dark/System theme selector)
- [x] Phase 26 — App Colour Themes (`client/src/theme.ts`: colour theme separate from light/dark mode, saved in localStorage `studyos-colour` — `default`, `palette:<id>` (7 palettes), `school:<id>` (the 35 universities), `hc:light` / `hc:dark`; applied as CSS variables on `<html>` by `ThemeProvider`; accent shades are COMPUTED from the base colour so white-on-accent and accent text stay ≥ 4.5:1 in both modes — never use a school colour raw for text or buttons; `--brand-bar` stripe shows the true two colours; `--accent-2` is the second colour for icons, dots and bars only (3:1, not text-safe, may be unset — always write `var(--accent-2, var(--accent-text))`); high contrast overrides every token and fixes the mode; selector lives in More; white text on a coloured background must use `--accent`, never `--accent-text`)
- [x] Phase 27 — Tuned School Colours + Font Choice (20 of the 24 guessed school shades replaced with the shade each university's own website uses, `source: "website"`, record in `docs/research/colour-tuning.md`; 9 swatches remain `approximate`; font picker in More with eight Thai typefaces — sans: IBM Plex Sans Thai Looped (DEFAULT for Thai and English, loaded in index.html), Sarabun, Noto Sans Thai Looped, IBM Plex Sans Thai, Noto Sans Thai; serif: Noto Serif Thai, Trirong, Taviraj — saved in localStorage `studyos-font`, applied by overriding `--font-sans`, loaded from Google Fonts only when chosen)
- [x] Phase 28 — Course Name Repair (migration 024 fixes 141 course names from migration 017: Thai tone marks stored as private-use codes U+F700–F71A from the source PDF's font are mapped back to real Thai; 15 names with the English stuck on the end are split into `name_th` / `name_en`; 3 stray credit digits removed; verified against the RU guides 2566 + 2567. TODO(data): 60 courses from migration 017 have NO name (codes not in the 2566/2567 guides) — needs the 2569 guide, do not guess. When copying Thai text out of a PDF, check for U+E000–U+F8FF)
- [x] Phase 29 — Palm Rejection in the Drawing Pad (`HandwritingPad`: a stroke is tied to the pointer that started it via `activePointer`, so a resting palm's touch move/lift events no longer drag the line to the palm or end the stroke; `pointercancel` keeps the stroke drawn so far; no callout/selection on the canvas. Touch still never starts a stroke, so fingers cannot draw — unchanged. Tested with simulated pen + touch events only, NOT with a real Apple Pencil)
