# Open items

Last updated 14 November 2026, after Phase 50. Everything that could be built or checked on the development machine has been. Each item below is still open for a stated reason: it needs a **person's decision**, something only the **owner** holds, a **device**, or **data** that is not published. For each: what was tried, and the exact next step.

## Needs a decision

| Item | Where it stands | Next step |
|---|---|---|
| **Offline use with sync** | The app says when it is offline and fails saves clearly; nothing is queued. Which data works offline, and how conflicts resolve, is an architecture choice. | Decide the scope (read-only offline, or offline writes with sync). |
| **Native app wrapper** | Deferred by the owner: "web app only for now". The lecture-transcript in-app browser depends on it (`LECTURE_TRANSCRIPTS_PLAN.md`). | Revisit when the web app is live. |
| **What AI may do with a lecture transcript** | Transcripts can be imported, read and searched. Nothing is generated from them, because of the rule "AI helps me practise, never does it for me". | Decide: quiz questions only, outlines, or nothing. |
| **Payment** | `/api/subscription/activate` grants premium with no payment, as on `main`. | Choose a payment provider. |

## Needs the owner

| Item | What was tried | Next step |
|---|---|---|
| **Review and merge the pull request** | Opened from a fork (no write access to the repository). | Owner reviews amsima809-lang/study-os#1. |
| **A real deploy** | The branch was run the way the Dockerfile runs it, on a new database (Phase 48). No Docker, Podman, Colima or Fly CLI on the development machine, and no access to the Fly app. | `fly deploy`, after the settings below. |
| **Google sign-in on the live site** | Exercised with a stand-in client: hand-off, return address and every failure path (Phase 48b). A successful sign-in needs a real client. | Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` (`DEPLOY.md`). Without them nobody can sign in. |
| **Push contact address** | Placeholder in place. | Set `VAPID_SUBJECT`. |

## Needs a device or a person

| Item | What was tried | Next step |
|---|---|---|
| **Notifications on a phone** | Proven end to end with desktop Chrome and Google's push service (`scripts/push-e2e.mjs`). The installed Android emulator has only a stub of Chrome; a Play Store image needs Java for the SDK installer; Xcode has no simulator runtime. | After the deploy: turn it on from a phone (on iPhone, add to Home Screen first) and use "send a test notification". |
| **Touch, Apple Pencil, on-screen keyboard, share sheet** | All built and tested with simulated events only. | Try each on a phone and a tablet. |
| **Screen readers; students using it** | Labels, roles and focus were audited by script. | A VoiceOver/TalkBack pass; watch three students. |
| **The lecture-collector bookmark** | Its logic was run on the live lecture site; the bookmark itself cannot load from `http://localhost`. | Try it from the deployed HTTPS site. |
| **Trademark clearance for "Termtrail"** | Nothing identical or similar found at the Thai, US, EU or Australian offices or in WIPO's database; small unregistered uses exist (`brand/trademark-brief.md`). TMview refuses automated access; ASEAN TMview refused connections; the UK office has a human-verification wall; the Swiss register was down. | Hand `brand/trademark-brief.md` to a trademark professional. |
| **Domains** | `termtrail.com`, `termtrail.app` and `termtrail.co.th` were unregistered on 14 November 2026. Buying them needs the owner's account and payment. | Register them. |

## Needs data that is not published

| Item | What was tried | Next step |
|---|---|---|
| **41 courses with no name** | Of the 60, 19 were named from the university's older guides (migration 031). The other 41 appear in no official document that could be opened: every central guide 2551–2569, the regional guides 2558–2569, the faculty's course descriptions and transfer forms, and the timetables from 1/2567 to 2/2569. They sit in gaps of the real numbering, so some may be misprints (HRM3214 looks like HRM3314). None has a class or an exam in the current term, so students do not meet them in the timetable. | Ask the faculty registrar, or supply the curriculum document (มคอ.2). Until then they stay unnamed: names are never guessed. |
