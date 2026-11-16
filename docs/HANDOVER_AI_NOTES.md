# Handover: AI notes, lecture summaries and handwriting (2026-11-16)

Written at the end of a long session so another session can continue. Read this, then
`CLAUDE.md` (Phases 75 and 76), then the notes folder README listed below.

## Delivery update, 16 November 2026

From a trial account, open **Study → Documents & lectures → Recorded lectures**. Expand a course and tap **Summary** (**สรุป**) beside a lecture. It opens the prebuilt AI summary immediately. **Notes** (**โน้ต**) opens your own notes for that lecture. **Transcript** (**คำบรรยาย**) includes a summary preview and a button to read the full summary. To open an example directly, sign in with the same trial account. [Open MGT3204 lecture 1](https://termtrail.com/api/open/lectures?view=lectures&summary=MGT3204-1)

Under **Layout for this lecture**, choose **Combine summary and notes** to show one **Summary and notes** (**สรุปและโน้ต**) button for that lecture. The choice is saved for your account. If you generated a copy for a lecture before this change, the reader starts in the layout you used for that copy and preserves its contents. Other lectures start with separate Summary and Notes buttons until you choose a layout for them.

The Mac mini holds all 42 prebuilt transcript/summary pairs. Both designated accounts were verified against all 42 across ACC1103 (the same recording as ACC1101), MGT3204, RAM1103 and RAM1132. The two shared-lecture releases are `dd9589c` and `f354ddc`. The production allowlist is in `SHARED_LECTURE_USERS`; ask RU before widening it. The other 70 recordings remain outside this release. A database backup was taken before import.

The follow-up adds private summary editing and restoration, lecture photo galleries, anchored pen annotations, reviewed handwriting search, separate/combined study notes and drawing review. In Combine, Flash chooses where a student's passage goes; the server retrieves its exact words and colours. A note with photos also has an action to read a sketchnote, review its arrows and see the original page. Details of the original requirements and source material follow.

To keep a page handwritten, choose **Pen**, write on the full-screen canvas, then tap **Done** and **Save note**. **Generate notes from handwriting** runs the tuned DeepSeek prompt on the saved page. Tap the small original beside the generated notes to read it full screen.

The internal TestFlight upload is build `202611160616`. It carries the PencilKit popover and native Thai/English dictation. Existing iOS builds can open the server-hosted lecture library. The physical iPad, Pencil, palm rejection and microphone checks are still open. Pricing and the optional v4 lecture format remain owner decisions.

The two reference pages were also run through the live drawing model. Instruction produced nine inline crops and the graph point (1, 2). Confirming its hub arrows restores both two-way links. One marked speech bubble was described as two dots instead of an ellipsis; a free-text correction can fix that in the same review batch. Boaler produced eight crops, the brain-systems group, the leftward Math connection and purple digits on yellow. Confirming the brain arrows restores all three two-way links.

**Original handover follows.** The state and deployment references below describe the start of this work.

## 1. Where things stand

| What | State |
|---|---|
| AI on DeepSeek V4 Flash, free (Phase 75) | **Live.** All AI calls go through `aiClient()` in `server/src/ai.ts`. `AI_IS_FREE = true` turns off the ฿99 paywall. The Mac mini has `DEEPSEEK_API_KEY` in `~/termtrail/termtrail.env` (backup `termtrail.env.bak-before-deepseek`). |
| "Summarise this note with AI" button on saved notes | **Live.** `POST /api/notes/:id/summarize` (`server/src/notes.ts`), button in `NoteView` (`client/src/screens/Notes.tsx`). |
| Note input bar, Pen only, PencilKit in the iOS app (Phase 76) | **Web part live. iOS in TestFlight build 202611160512.** Not yet tried on a real iPad (Pencil, palm, Scribble, the PencilKit page). |
| Lecture transcripts | **Collected, not in the app.** 112 lectures / 10 subjects, in the notes folder (below). |
| Lecture summaries | **Written and checked, not in the app.** 42 lectures of the app's 4 courses, prompt v3. |
| Drawing → structured notes | **Designed and tested on two sketchnotes; not built.** Prompts and results in the notes folder. |
| Live site | `https://termtrail.com` runs `d39564d` (includes the parent session's front-page change "Preview features"). |

Commits from this work on `pat-edits` (pushed to `fork`): `a960f36`, `2c85a1e`, `653f0a6`, `6c79a72`, `3a65180`.

## 2. Where the files are

**Notes folder (outside the repo, persistent):**
`/Users/patricktanna/Library/Application Support/Claude/side-session-notes/local_0a32be3e-8a59-4fd6-a8fd-b87aa3bae6cd/`

- `lecture-summary/README.md`: running log of every decision and result (read it).
- `transcripts/raw/subject-<id>_<codes>.json`: the collector's bundle format (`{format, subject_label, course_codes, collected_at, sessions:[{no, url, cues:[{startMs,endMs,text}]}], skipped}`). 16 MB.
- `transcripts/receiver.py`: the local receiver used to get the bundles out of the browser (see §6).
- `lecture-summary/summaries/<CODE>_L<nn>.md` + `summaries/manifest.json`: the 42 summaries (model, tokens, source URL per lecture).
- `lecture-summary/prompt_v3_lecture.txt`, `run_v3.py` (batch runner, skips done ones), `check_v3.py` (checker).
- `lecture-summary/research-note-taking-prompts.md`: prompt research (arXiv / GitHub / vendor docs) with sources.
- `lecture-summary/sketch/`: drawing prompts and runs. `prompt_sketch_v4.txt` is the current merged prompt (arrow-by-arrow + colours + maths + the owner's rules); `prompt_arrowheads.txt` is the focused arrowhead pass; `color/` has the Boaler sketchnote tests including crop boxes.

**Deliberately NOT in git:** RU transcripts and summaries (RU's content; every transcript opens with RU's copyright notice). Load them into the live database with a script; the database and its daily backups hold them.

**DeepSeek key on the MacBook:** `DEEPSEEK_API_KEY` in `~/Projects/honey/.env`. Read it in scripts; never print it.

## 3. Owner decisions (2026-11-16, his words where useful)

- AI summaries of the lecture transcripts, placed in the notes' AI summary sections; **DeepSeek V4 Flash** for every AI feature (`deepseek-flash`; `deepseek-v4-pro` is text-only, it cannot see images).
- "remove the requirement to put in an API key and also the 99 baht /month fee … my partner will test using it and we'll find the correct pricing … later (if at all)".
- **Pre-summarise all transcripts once** ("those won't be changing anyway … reduce costs … faster"), and **pre-save the full transcript** on the site so nobody downloads it each time. (RU's copyright notice was raised twice; the owner chose this. Ask RU before wider release.)
- Summary format v3 (see §4) agreed: "Tune format first" → v3 fixes → "Yes, apply and run".
- **Timestamps are chips** that jump to that line of the transcript; transcript lines carry chips back to the summary point.
- Study section: wherever lecture summaries/notes are listed, **quick links to the AI notes and to any note images**; several images per lecture shown as a **gallery** she can cycle through.
- **AI summaries are editable by hand** (her own copy; keep the AI original to restore).
- Note input: **Speak, Keyboard, External keyboard, Pen** icons; keyboard/pen light up by themselves; **Pen only** stops palms; in the iOS app **Apple's PencilKit tool picker** ("web can have whatever takes it close").
- "Create notes with AI" with **"Keep summary and notes separate" / "Combine summary and notes"**, the choice remembered at its last position; her own notes **keep the colours she wrote them in** (everyone has their own colour coding).
- Pen notes on the summary: underline or circle text, write a note in the accent colour, Save/Cancel beside it, never off-screen.
- Drawings: AI redraws diagrams cleanly; **equations in their own style**; **drawings cut out inline + one full-page thumbnail at the bottom**; the AI's "please check" questions kept as few as possible; **answers applied in one batch** (a "yes" needs no AI call).

## 4. Lecture summaries: how they were made

- Format (prompt v3): gist; "recorded in term X/25XX" only when the lecturer says it; main points in lecture order, about one per 10 minutes, 3–10, each ending `[mm:ss]`; must-remember (definitions/lists, no repeats of main points); ⭐ the lecturer stressed (exam format, what is examinable; **no class logistics** such as next-class dates, Line groups); 3–5 "try answering before the video" questions with no answers, no timestamps, no hints; anything outside the lecture labelled `[นอกโน้ต — ตรวจกับตำราก่อน]`.
- Input: cues as `[mm:ss] text` lines (or `[h:mm:ss]`), course name in Thai + English, session number, length.
- Results: all 42 pass `check_v3.py` (every timestamp lands on a real cue start; sections present; 5 questions each). ACC1101 lecture 6 was regenerated (first try had 20 main points). The "LINE" flag on RAM1103 L05 is a false positive (that lecture teaches LINE messages). About 41 s and ~20k input tokens per lecture.
- ACC1101 and ACC1103 share one recording (stored once as `ACC1101_*`).
- The other 70 lectures (CDM1101, CDM2103/MCS1151, LAW1001/1101, LAW1002/1102, POL1101, POL2106) are collected but their courses are not in the app's catalogue.
- Research suggests a v4 (optional): quote the supporting transcript line before each point; summarise in 10–15-minute chunks then merge; a cheap verification pass; transcript first, instructions last.

## 5. What is left (in the agreed order)

### 5.1 Pen-only lock + input bar: finish
- Ask the owner's partner to try TestFlight build 202611160512 on her iPad: Pen opens Apple's PencilKit page; palm resting does nothing; Done puts the drawing in the note; tapping it reopens with her ink; saving sends the PNG.
- Web Speak uses the browser's speech recognition and is hidden inside the iOS app (native dictation is §5.4).

### 5.2 Saved lectures with summaries (the biggest next piece)
1. **Tables** (new migration): a shared transcript per lecture (`course_code`, `session_no`, `source_url`, `cues` JSON, `collected_at`, tied to `course_lectures`), and a shared summary per lecture (`summary_md`, `model`, `prompt_version`, `created_at`). Keep the per-student `lecture_transcripts` (Phase 31) for courses not pre-collected; prefer the shared copy when it exists.
2. **Import script** run ON the Mac mini (not in git data): reads the notes-folder bundles and summaries (copy them over with `scp`) and upserts them. Only the 4 catalogue courses (ACC1101+ACC1103 share subject 15).
3. **Showing them:** Study section (Notes / Documents & lectures, `client/src/screens/Library.tsx` already lists lectures with Read/Watch and a transcript viewer `TranscriptView`): each lecture gets its AI summary (banner "AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก"), a quick link to the AI notes, and the note images she captured for that lecture as a swipe/arrow **gallery**.
4. **Jump chips:** render each `[mm:ss]` in the summary as a chip that opens the transcript scrolled to that cue and highlights it; in the transcript, a cue cited by a summary point carries a chip ("Main point 3", "⭐") back to it; a "← back" chip after a jump. Parse at display time, nothing extra stored.
5. **Edit by hand:** Edit button on any AI summary → her own copy (per student), labelled "edited by you", original restorable.
6. Update `docs/LECTURE_TRANSCRIPTS_PLAN.md` (the "per student, never shown to others" rule changed by the owner) and `docs/OPEN_ITEMS.md`.

### 5.3 Pen notes on the summary
Pen mode on a summary: an underline or circle selects the text under it (`document.caretRangeFromPoint`); in the iOS app open a small PencilKit box as a **popover** anchored to the mark (iOS keeps popovers on screen); in a browser use a small web pad. Save the ink (PencilKit data + PNG) anchored to the quoted text, not screen pixels. Later: Flash reads the ink into text so pen notes are searchable and usable in "Combine".

### 5.4 Native dictation (iOS app)
A plugin using Apple's `SFSpeechRecognizer` with `th-TH` (Apple lists Thai for Dictation incl. on-device). Needs microphone + speech-recognition permission strings (Thai + English) and a TestFlight build. Feed the same `onDictated` path as web Speak.

### 5.5 Create notes with AI
Toggle "Keep separate" / "Combine". The original plan kept one setting per account. The delivery update above records the later decision to remember it for each lecture. Combine: pass her notes and the lecture summary as two labelled sources; keep her lines word for word (tidy only), each tagged as hers; the server checks every "hers" passage really comes from her notes; show hers in her own ink colours (PencilKit gives exact stroke colours; adjust lightness for light/dark mode), with a small side marker so hers stands apart.

### 5.6 Drawings → clean notes (tested, not built)
Pipeline that worked on the two test pages (Instruction sketchnote; Boaler "Seeing as Understanding"):
1. Read the page with `prompt_sketch_v4.txt` (Flash, `reasoning_effort: "max"`, JSON mode, **streamed**): whole page + 4 overlapping zoomed crops; items → every line with an arrowhead flag at each end → touch check → groups (braces) → notes as blocks (`heading`/`text` as coloured runs, `diagram` Mermaid built only from listed lines with `node_colors`, `math` blocks of LaTeX steps with `op`s), `please_check` ≤ 3 yes/no.
2. Locate drawings (pixel boxes), then **refine** each: widen by ~120 px, cut out, ask Flash to re-find that drawing → 16/19 clean crops. Add rules: a row of similar small pictures is ONE drawing; skip tiny decorative doodles. In the iOS app use PencilKit stroke positions instead.
3. Show notes with drawings inline + the full-page thumbnail at the bottom; equations typeset with KaTeX as aligned steps (ops faint on the right, boxed answer only if she boxed it).
4. Questions: always ask "Is this two-way?" for lines that leave a hub (Flash cannot see small second arrowheads, even with the focused `prompt_arrowheads.txt` pass, which did fix where lines attach). Collect answers; a "yes" needs no call; apply all corrections in ONE text-only call (~40 s).
Ground truth for regression: Instruction page — PRIOR KNOWLEDGE ↔ NEW LEARNING and NEW LEARNING ↔ CULTURAL (both two-way), 3 speech bubbles (1 empty, 2 "…"), graph point (1, 2). Boaler page — brain ↔ memory / control / detection (two-way), "brain systems" is a group box, Math → Sensory motor memories (points left), headings red, digits 1–3 purple on yellow.

## 6. Gotchas learned

- **DeepSeek:** long non-streamed answers drop with `IncompleteRead` — always `stream: true`. Thinking tokens count toward `max_tokens` (`aiMaxTokens()` adds 8000). The Anthropic-compatible endpoint is `https://api.deepseek.com/anthropic`; OpenAI-style is `https://api.deepseek.com/chat/completions` (accepts `reasoning_effort` low/high/max and `response_format: json_object`). `deepseek-v4-flash` maps to `deepseek-flash`.
- **Getting data out of the signed-in RU tab:** the built-in browser pane blocks `fetch()` from RU's page to localhost, but a top-level multipart **form POST** to `transcripts/receiver.py` (127.0.0.1) works. Set `window.STUDYOS_COLLECTOR_EMBED = true` before loading the collector or it downloads a file. Keep the 800 ms pause between lecture pages. Never type RU credentials (the owner signs in himself).
- **Server type check includes `server/test`:** never `typeof import("../../client/...")` in a test (pulls DOM code into the server's `tsc`); type it locally. This broke one deploy.
- **Local preview:** the app's preview launcher cannot read `~/Documents` (macOS privacy), and another session's dev server holds 3100/5180. What worked: server `PORT=3191 DB_PATH=<scratch> npx tsx src/index.ts` + a temporary Vite config on 5191 proxying to 3191 (delete it after); dev login via `POST /api/auth/dev-login`. `lsof` can hang on this Mac; find processes with `ps eww`.
- **Deploy:** `ssh patricktanna@pat-mac-mini.tail7378d8.ts.net 'bash ~/termtrail/app/deploy/update.sh'` (runs build + tests; fails on any type error). Push only to `fork`. Commit only your own files. Don't touch auth (`server/src/auth.ts`); another session works on the iPhone sign-in.
- **TestFlight:** `bash native/scripts/testflight.sh` (build number = UTC minute). New plugins: add the Swift file to `native/ios/App/App.xcodeproj/project.pbxproj` (4 entries) and register it in `MainViewController` (in `AppSignIn.swift`).

## 7. Open for the owner

- Ask RU about serving transcripts and summaries to every student.
- Partner's iPad test of build 202611160512.
- The 70 lectures of courses not in the catalogue.
- In-app summaries of typed notes still use the original prompt (not the cited v-format).
- Pricing, whenever ready.
