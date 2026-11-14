# Lecture transcripts plan

Status: direction decided 2026-11-14. Steps 1 and 2 (web) are built; steps 3 to 5 are not started.

## Decision

Lecture transcripts come into StudyOS through an **in-app browser**. The student signs in on the university's own page inside the app; the app then reads the transcripts from the pages it is showing. StudyOS never sees or stores the university password.

Ruled out:
- The student giving StudyOS their e-service password (breach risk, likely against university rules, easy for the university to block).
- The server fetching lecture pages (it is not signed in as the student).
- Reading the pages from the plain web app (browsers block one site from reading another).

## What this commits us to

- **A native app.** An in-app browser that can read the page it shows only exists in a native shell. The route that fits is wrapping the existing web app (Capacitor), not a rewrite. This settles the "native apps" item in `UX_REVIEW_PLAN.md`; offline sync is still open.
- **The right kind of in-app browser.** The standard Capacitor Browser plugin opens the system browser tab, which cannot read pages. This needs a web view the app controls, with script injection and a message channel back to the app. Which plugin: to be confirmed in a small spike (step 3).
- **The web app keeps deep links only.** In a normal browser the Library lecture buttons still just open the university site.

## What we know about the source

See `ARCHITECTURE.md` (Phase 30) and `research/ru-lecture-links.json`.
- `sub-demo.ru.ac.th/student/`: `index.php` lists subjects, `subject.php?subject_id=N` lists sessions, `watch.php?session_id=N` is one lecture.
- Each watch page embeds the timed Thai transcript: `var CUES = [{ startMs, endMs, text }, ...]`.
- The host name says "demo". Expect it to move or change.

## Flow

1. The student taps "Download lectures" on a course.
2. The app opens that course's subject page in the in-app browser. If the site redirects to its login, the student signs in there.
3. A small collector script, injected by the app, reads the session list, then loads each watch page in turn (with a pause between pages) and reads `CUES`.
4. The collector hands each transcript to the app, which uploads it to StudyOS under the student's account.
5. The in-app browser closes and the course shows its lectures as downloaded.

## Rules

- **Per student.** A transcript belongs to the student who downloaded it and is never served to another user.
- **Gentle.** One page at a time, with pauses, only for the course the student asked for.
- **Honest failure.** If the page layout changes and `CUES` is missing, say so and stop; do not guess.
- **Ask the university.** Bulk-saving transcripts is a bigger ask than linking. Their agreement, or an official feed, would replace steps 2 to 4.
- **Repo principle.** "AI helps me practise, never does it for me": decide what the app does with a transcript (searchable text, outline, quiz questions, or written notes) before building that part.

## Build order

1. **Receiving end (web, testable now).** Table for per-student lecture transcripts, an upload endpoint, and a transcript view on the course's lecture list.
2. **Collector script (testable now).** One script that works on the subject and watch pages. It can be run by hand in a desktop browser against a signed-in tab, which proves steps 3 and 4 before any native work.
3. **Native shell spike.** Wrap the web app with Capacitor, pick the web-view plugin, and prove sign-in, script injection and the message channel on one iPhone simulator and one Android emulator.
4. **Wire it together** in the native app: the "Download lectures" button, progress, and errors.
5. **Notes and action items from a transcript**, once the principle question above is answered.

## Risks

- The site is a pilot and may change without notice.
- App store review: an app that is only a wrapped website can be rejected, and a web view that reads a third-party site may draw questions. The app needs real native value (offline notes, reminders with notifications, pencil input).
- If the university adds a captcha or two-step sign-in, the student still signs in themselves, so the flow survives; only the collector needs to cope with the extra page.
