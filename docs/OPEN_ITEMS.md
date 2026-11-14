# Open items

Last updated 14 November 2026, after Phase 55. Everything that could be built or checked on the development machine has been. Each item below is **blocked**: it cannot be finished from the development machine, for the reason given. It needs a **person's decision**, something only the **owner** holds, a **device**, or **data** that is not published. For each: what was tried, why it stops there, and the exact next step.

What the development machine does not have (re-checked 14 November 2026, after Phase 51): no Docker, Podman, Colima or Fly CLI; no Java runtime (so the Android SDK installer cannot add a system image); Xcode without any iOS simulator (`simctl` lists no runtimes and no devices, and the app's simulator tool also needs an administrator password to select Xcode); one Android emulator image whose Chrome is a stub that cannot open a page; no Google sign-in keys and no Fly credentials; read-only access to the repository (pull, not push).

## A trial copy is live

**https://amsima.com/termtrail** (Phase 52, 14 November 2026) runs this branch on the owner's Mac mini, for his partner to review. Sign-in is the trial sign-in: any email address plus the access code (kept in `data/private/termtrail-trial-access-code.txt` on the development machine, never in the repository). It has no Google sign-in and no AI key, so the AI features say they are not set up. Checked from the public internet in a clean browser: the page, icons, manifest and service worker load under `/termtrail` with no errors, a wrong code is refused, and the right code signs in and reaches onboarding. How it is hosted and updated: `DEPLOY_SUBPATH.md`.

Because it is a real HTTPS site, the phone checks listed under "Needs a device or a person" can now be done on it by anyone holding a phone and the access code: add to Home Screen, notifications, touch and Pencil, the share sheet, and the lecture-collector bookmark.

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
| **Review and merge the pull request** | Opened from a fork and kept up to date through Phase 51; it is open, mergeable, and has no review yet. Blocked: this account can only read the repository, and merging is the owner's call. | Owner reviews amsima809-lang/study-os#1. |
| **A real deploy** | The branch was run the way the Dockerfile runs it, on a new database (Phase 48). No Docker, Podman, Colima or Fly CLI on the development machine, and no access to the Fly app. | `fly deploy`, after the settings below. |
| **Google sign-in on the live site** | Exercised with a stand-in client: hand-off, return address and every failure path (Phase 48b). A successful sign-in needs a real client. | Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` (`DEPLOY.md`). Without them nobody can sign in. |
| **Push contact address** | Placeholder in place. Blocked: it must be an address the owner answers, and it is set on the live server. | Set `VAPID_SUBJECT`. |

## Needs a device or a person

| Item | What was tried | Next step |
|---|---|---|
| **Notifications on a phone** | Proven end to end with desktop Chrome and Google's push service (`scripts/push-e2e.mjs`). The installed Android emulator has only a stub of Chrome; a Play Store image needs Java for the SDK installer; Xcode has no simulator runtime. | After the deploy: turn it on from a phone (on iPhone, add to Home Screen first) and use "send a test notification". |
| **Touch, Apple Pencil, on-screen keyboard, share sheet** | All built and tested with simulated events only. Blocked: no phone, tablet or working simulator here. | Try each on a phone and a tablet. |
| **The new logo on a real home screen** | Checked in a clean browser: login page (amber top book with no university, white with one), phone header and desktop sidebar, light and dark. The home-screen icons were measured and cropped as a circle, a squircle and a rounded square: the mark stays inside the safe circle (it reaches 38.8% of the width from the centre; the limit is 40%). Blocked for the last step: installing to a home screen needs a phone and the HTTPS site. A simulated iPhone was offered (it would mean downloading Apple's iOS simulator, several GB; Xcode here has none) and **Patrick chose to wait for a real phone (14 November 2026).** | After the deploy: add to Home Screen on an iPhone and an Android phone and look at the icon. |
| **Screen readers; students using it** | Labels, roles and focus were audited by script. Blocked: needs a person listening to a screen reader, and real students. | A VoiceOver/TalkBack pass; watch three students. |
| **The lecture-collector bookmark** | Its logic was run on the live lecture site; the bookmark itself cannot load from `http://localhost`. | Try it from the deployed HTTPS site. |
| **Trademark clearance for "Termtrail"** | Nothing identical or similar found at the Thai, US, EU or Australian offices or in WIPO's database; small unregistered uses exist (`brand/trademark-brief.md`). TMview refuses automated access; ASEAN TMview refused connections; the UK office has a human-verification wall; the Swiss register was down. Blocked: clearance is a legal opinion, and those walls are not to be worked around. | Hand `brand/trademark-brief.md` to a trademark professional. |
| **Domains** | Re-checked on the evening of 14 November 2026: `termtrail.com` and `termtrail.app` have no record in the registries (RDAP answers "not found") and `termtrail.co.th` has none at THNIC. The owner's other domains are registered at Cloudflare, which sells both `.com` and `.app`. **Decision (Patrick, 14 November 2026): not yet.** They stay unregistered until he says otherwise; anyone could take them meanwhile. `termtrail.co.th` cannot be bought at all for now: THNIC gives a `.co.th` name only to a company registered under that name (or holding that trademark), and no such company exists. | When Patrick decides: register `.com` and `.app` in his Cloudflare account. `.co.th` only after a company or a Thai trademark named Termtrail exists. |

## Course data: what is now official, and what is not

Term 2/69's class times, rooms, lecturers and exam dates come straight from the registrar's two documents (Phase 54), and each major's course lists come from the faculty's 2569 curriculum (Phase 55). Both are generated by scripts that check themselves against the documents. What is still open:

| Item | Where it stands | Next step |
|---|---|---|
| **Choose-one groups and prerequisites** | The curriculum prints general education in "choose one of these" groups, and some courses have prerequisites. The app's groups and prerequisites still come from the first author's Marketing plan only; the other nine majors have none recorded. | Read the groups from the same chapter (they are marked beside each list) if the planner should enforce them for every major. |
| **Students from before 2565** | The lists are the current curriculum (students with ID 65 onwards). Students with ID 62 to 64 follow an older one, with other codes (BAP…, ACC1130…). The registrar's term record has those courses; the app has no older curriculum to place them in. | Decide whether older cohorts matter; if so, import the 2564 chapter the same way as a second set of lists. |
| **Other faculties** | The official record holds all 2,762 courses, but only the 9 Business Administration majors exist in the app, so a student of another faculty has no major to choose and sees no courses. | Decide which faculty is next and supply its curriculum; the term data for it is already loaded. |
| **Clock times of exam periods A and B** | The documents print only "A" or "B". The app shows A as 09:30–12:00 and B as 14:00–16:30, as the first author recorded; the previous data had used 09:00–12:00 and 13:30–16:30. Not found on the registrar's site. | A current student confirms the two times; they are one constant (`EXAM_PERIODS`) and one line in the import script. |
| **Who may register for a course** | The registrar's notes ("for students with ID 62–64", "not open to accounting students") are shown word for word in the course picker. The app does not use them to hide courses. | Decide whether to filter by entry year automatically. |

## Closed

| Item | How it was settled |
|---|---|
| **41 courses with no name** | They were not real courses. The faculty's 2569 curriculum, read list by list (Phase 55), names none of them and has the real courses they stood in for; they are removed. |
| **Which courses belong to which major** | Rebuilt from the same curriculum (Phase 55). |
