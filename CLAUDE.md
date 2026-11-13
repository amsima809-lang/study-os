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
