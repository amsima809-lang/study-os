# UX review findings

Date: 2026-11-14. Branch `pat-edits`, after Phase 34. Plan: `UX_REVIEW_PLAN.md`.

## How this pass was run

- **Automated audit** of all 14 screens (Today, Notes, Quiz, Review, More, Reminders, Study plan, Library, Schedule, Stats, Planner, Mock, Weakness, Costs) at six sizes: phone portrait 375×812, phone landscape 812×375, tablet portrait 768×1024, tablet landscape 1024×768, desktop 1440×900, desktop portrait 900×1440. Each run measured sideways overflow, tap-target sizes, text size, truncated text, unlabelled buttons, input text size, and how much of the width the content uses.
- **By eye:** Today at phone landscape, tablet portrait and desktop; the calendar week view on desktop.
- **Code checks** for offline handling, drafts, error states, delete confirmations, gestures, import and export, sign-in sessions.
- Test account: Marketing major with five courses chosen for the term and three reminders.

### Not covered

These need real devices or people and were not done:
- Real phones and tablets (only browser emulation was used), the on-screen keyboard, Apple Pencil.
- Screen readers (VoiceOver, TalkBack).
- Speed on a mid-range Android phone on mobile data.
- Watching students use it.
- The Login and Onboarding screens, sheets and dialogs were not in the automated audit.

Severity: **A** blocks a task or loses work, **B** slows a task, **C** cosmetic.

## Findings

### 1. Finding the main action (reported in testing, confirmed)

**Status: fixed 2026-11-14 (Phase 35).** One labelled Add button on the calendar; custom events folded into reminders as a third kind, "event"; clicking an empty hour, double-clicking a day, or the "add on this day" row opens the same form with the day and time filled in; one shared add-button style on Calendar, Reminders, Notes and Library. On phones the button now floats at the bottom right on every screen that has one (Phase 42).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 1.1 | B | Today has four "add" controls for three kinds of thing: a + in the calendar header and another + in the selected-day panel (both add a "custom event"), the quick-add field (a to-do), and the + on the Reminders screen. Custom events and reminders are separate systems that both land on the calendar. | One "Add" for the calendar that creates one kind of item, with a choice of to-do, reminder or event. Fold custom events into the reminders model. Remove the second +. |
| 1.2 | B | Clicking an empty day or hour does nothing, on any device. Confirmed on desktop in the week view. | Click or tap an empty slot to open the add form with that date and time filled in. |
| 1.3 | B | The two calendar + buttons are 30×30 and 24×24 pixels, and unlabelled except for a tooltip. | A labelled button at least 44 pixels tall. |
| 1.4 | B | The main action looks different and sits in a different place on each screen: "+ เพิ่มโน้ต" is a 94×32 text button on Notes, a 40×40 round + on Library, a 44×44 round + on Reminders, a small icon on the calendar. | One pattern everywhere: the same primary button, same position (bottom right on phones, top right with a label on wide screens). |

### 2. Tap targets

**Status: fixed 2026-11-14 (Phase 37).** All controls are at least 44px tall; re-audit at 375×812 finds none undersized on any screen, apart from the week view's seven day headers, which are 41px wide because seven columns must fit a 375px screen (58px tall).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 2.1 | B | On Today, 40 of 52 tappable controls on a phone are under 44 pixels (45 of 52 at the wider sizes). Calendar day cells and the previous/next arrows (30×30) are the bulk. | Day cells and arrows at 44 pixels minimum. |
| 2.2 | B | The header's theme button (32×32) and language button (40×32) are undersized on every screen. | 44×44. |
| 2.3 | B | Tab switchers are short: Mock 32 pixels tall, Schedule and Quiz 36, the theme mode control 40. | 44 minimum. |
| 2.4 | A | The four sliders on the cost calculator are 16 pixels tall, below the 24-pixel accessibility minimum. | Taller touch area for sliders. |

### 3. Layout, by device and orientation

**Status: fixed 2026-11-14 (Phase 38).** Phone landscape and tablet portrait get a 72px icon rail instead of the 224px sidebar (content width 734 and 690 pixels, up from 588 and 504); desktop content is 1,152 pixels wide with Today in two columns and card lists in two columns; the wide sidebar lists every screen. Library and Mock lists are two columns as well (Phase 42).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 3.1 | B | **Desktop (1440×900):** content is one column capped at 728 pixels, about half the window, with empty bands either side. More is 1,864 pixels tall and Planner 1,674, so long scrolling beside unused space. The week grid is also held to 728 pixels. | Raise the cap on wide screens; two columns on Today (calendar beside the lists); let the calendar use the full width. |
| 3.2 | B | **Phone landscape (812×375):** the layout switches to the desktop sidebar because it only looks at width. The sidebar takes 224 pixels (28%) of a 375-pixel-tall screen. One card fits above the fold, and the hour grid is capped at 225 pixels. | Choose the layout by height as well: on a short screen use a slim icon rail, and let the hour grid fill the height. |
| 3.3 | B | **Tablet portrait (768×1024):** the sidebar leaves a 504-pixel content column, narrower than a phone held sideways. | Icon rail or bottom tabs at this size. |
| 3.4 | B | The desktop sidebar lists only the five menu items. The other nine screens are behind More although there is room to list them all. | Show every screen in the sidebar on wide layouts. |
| 3.5 | – | No screen scrolls sideways at any of the six sizes. Tablet landscape and desktop portrait have no layout problems beyond 3.1. | None needed. |

### 4. Readability

**Status: all fixed 2026-11-14 (4.1 in Phase 37; 4.2, 4.3, 4.4 in Phase 40).** No text below 12px on any screen except the "+N" badge in the week grid (11px).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 4.1 | B | Course chips shrink with the text around them: 9.6 pixels in reminder rows and 11.2 pixels in most lists. Week-grid labels are 10 pixels. | A 12-pixel floor for chips and grid labels. |
| 4.2 | C | On a phone, the More list cuts off "แผนการเรียน (จบ 132 หน่วยกิต)". | Shorter label or allow two lines. |
| 4.3 | C | The back link inside More reads "← ← เพิ่มเติม": the arrow is in both the code and the translation. | Remove one. |
| 4.4 | C | Two messages are hard-coded in Thai and show in English mode: "โหลดข้อมูลไม่สำเร็จ" and "ลบเอกสารนี้?". | Move to the translation table. |

### 5. Not losing work

**Status: fixed 2026-11-14 (Phase 36).** The unfinished note (text, drawing, photos) is kept on the device and comes back after a tab switch, refresh, lock or sign-out; sign-ins survive a server restart; an ended session returns to the login page. A new reminder, to-do or event being written is kept too (Phase 43), and so is a quiz in progress (Phase 42). Where a draft cannot be stored on the device, or a quiz is still being generated, the app asks before leaving the screen or closing the page (Phase 43). Not done: syncing a draft between devices, which belongs to the offline-and-sync decision.

| # | Sev | Finding | Fix |
|---|---|---|---|
| 5.1 | A | Switching tabs throws away whatever is on the screen: the app rebuilds each screen from scratch when its tab is opened. A half-typed note, or a drawing in progress, is lost by tapping another tab. | Keep a draft of the note form (text and strokes) and restore it. |
| 5.2 | A | Notes have no saved draft at all, so a phone locking, a closed tab or a refresh also loses the note. Only Mock exam and Planner keep drafts. | Same fix as 5.1; warn before leaving with unsaved work. |
| 5.3 | A | Sign-in sessions are kept in the server's memory. Every restart or deploy signs every student out, mid-task. | Store sessions in the database. |
| 5.4 | A | When a session has ended, the app does not notice: there is no handling of "not signed in" responses, so screens show a generic error instead of the login page. | Detect it once, centrally, and return to login (keeping the draft from 5.1). |

### 6. Feedback, errors and loading

**Status: 6.1 and 6.3 fixed, 6.2 stopgap done, 2026-11-14 (Phase 40).** Failed loads on Today, Reminders, Week and Exams offer "try again" and say when the device is offline; an offline banner shows across the app; every delete uses the same in-page confirmation. Every other screen got the same "try again" in Phase 42. Still open: offline use with sync (nothing is queued).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 6.1 | B | Every failure shows the same red box with one generic line. Nothing in the app offers "try again". | Say what failed and give a retry button. |
| 6.2 | A | The app never checks whether it is online. Offline, only Today and due flashcards can be read; every save fails with the generic error. | At minimum an "offline" banner and disabled saving; proper offline use is the architecture decision in the plan. |
| 6.3 | B | Delete confirmations differ: Notes and Library use the browser's own pop-up; reminders and transcripts confirm in the page; deleting a chapter and deleting a calendar event (a 14-pixel ×) ask nothing. | One in-page confirm pattern, used for every delete. |
| 6.4 | – | A loading spinner exists and is used. Double-submit protection was spot-checked on the newer forms only. | Check the older forms. |

### 7. Typing

| # | Sev | Finding | Fix |
|---|---|---|---|
| 7.1 | ? | Nothing in the code responds to the on-screen keyboard opening. Whether it hides fields or buttons needs a real phone. | Test on devices; then pin forms above the keyboard where needed. |
| 7.2 | – | All text fields use 16-pixel text, so iPhones do not zoom the page on focus. | None needed. |

### 8. Gestures and stylus

**Status: 8.1 and 8.2 fixed 2026-11-14 (Phase 41), with simulated touches only.** Swipe on the calendar; one-finger scroll, two-finger pinch and pan, and optional finger drawing on the pad. Phase 43 added swipe right on a to-do to tick it, pull down to reload a screen, and pen pressure. Still open: a real-device test of all of it (8.3).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 8.1 | B | The only gestures are press-and-hold on the menu and drawing with a pen. No swipe between days, weeks or months; no swipe to complete a to-do; no pull to refresh. | Swipe left and right on the calendar first. |
| 8.2 | B | The drawing pad zooms with buttons only (no pinch), and a finger cannot draw or scroll the page inside it. | Two-finger pinch and pan; optional finger drawing. |
| 8.3 | ? | Palm rejection was fixed in code but has not been tried with a real Apple Pencil. Pen pressure is not used. | Device test. |

### 9. Content in and out

**Status: 9.2 and 9.3 fixed, 9.1 partly, 2026-11-14 (Phase 41).** Notes can be searched and exported (print or PDF, and a text file); photos can be dropped or pasted into a note and a file dropped onto the Library upload. Phase 43 added sharing text and links into StudyOS from other apps once it is installed to the home screen; sharing photos or files in is not built (it needs a handler in the service worker and an installed app to test on).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 9.1 | B | Importing is the file picker and the camera or photo library only. No drag and drop, no paste, and other apps cannot share into StudyOS. | Drag and drop and paste on desktop; a share target for installed and native apps. |
| 9.2 | B | Notes cannot be searched. | Search across notes. |
| 9.3 | B | The only export is the study plan's calendar file. Notes cannot be exported. | Export a note as PDF or image. |

### 10. Accessibility

**Status: 10.2 fixed (Phase 37), 10.3 fixed (Phase 40), 2026-11-14.** Calendar marks have a shape per kind, a legend, and spoken labels.

| # | Sev | Finding | Fix |
|---|---|---|---|
| 10.1 | – | No icon-only button is missing a label on any screen. Keyboard focus is visible. Theme colours are contrast-checked. Zoom is not blocked. | None needed. |
| 10.2 | B | The "reduce motion" setting is ignored: fades, slide-ins and the login page's drifting shapes always animate. | Honour the setting. |
| 10.3 | B | Calendar dots tell the kind of item apart by colour alone. | Add a shape or count; the day list already labels them. |

## Second pass, 2026-11-14 (after Phases 36 to 42)

Same automated audit, all 14 screens at the same six sizes, plus the Login screen, the first Onboarding step, the reminder sheet, the course picker and the university picker at phone size.

**Result:** no control under 44 pixels, no text under 12 pixels, no sideways scrolling, no unlabelled button, no input under 16 pixels, at any size. The one exception is the week view on a 375-pixel phone, whose seven day headers are 41 pixels wide (58 tall) because seven columns have to fit.

Found and fixed in this pass:
- The login page's photo-credit link was 70×20 pixels; it now has a 44-pixel touch area.
- Ten screens hid a failed load (an empty list, or a spinner that never ended); they now say so and offer "try again".
- A quiz in progress was lost by tapping another tab; it is now kept and resumed.
- The main add button on phones now sits in one fixed place, bottom right (the part of finding 1.4 left open).
- Library and Mock lists use two columns on wide windows.

### Still open

Needs a device, a person or a decision, so not done here:
- **Real devices:** phones and tablets, the on-screen keyboard (7.1), Apple Pencil with the new finger gestures (8.2, 8.3), screen readers, speed on a mid-range Android phone, and watching students use it.
- **Decisions:** offline use with sync (6.2 is only a notice and clear errors); notifications when the app is closed (web push); the native wrapper with its in-app browser and share-from-other-apps (web app only for now); what AI may do with a lecture transcript.
- **Data:** 60 course names that need the 2569 admission guide.
- **Not verified:** the lecture-collector bookmark on a deployed HTTPS site.
- **Not built:** sharing photos or files into StudyOS from other apps (text and links work).

## Third pass, 2026-11-14 (Phase 43)

Everything left on the list above that did not need a device, a decision or data:

- **Reminder form draft.** A new item being written survives the sheet being closed by a stray tap, a tab switch or a refresh. Cancel discards it.
- **Warning before leaving (5.2).** Asked only when work would really be lost: a note whose draft could not be stored on the device, or a quiz still being generated. The browser asks the same when the page is closed or reloaded. Work that is safely kept as a draft does not trigger a warning.
- **Swipe to complete (8.1).** Swipe a to-do or reminder right to tick it, or to un-tick it.
- **Pull to refresh (8.1).** Pull down from the top of any screen to reload it; drafts are kept.
- **Pen pressure (8.3).** A pressure-sensitive pen draws thinner or thicker lines.
- **On-screen keyboard (7.1).** Sheets and dialogs lift above the keyboard where it covers the page, and the field being typed in is scrolled into view. Built from the specification; the keyboard itself could not be tested here.
- **Share into StudyOS (9.1).** Text and links.
- **Onboarding and paywall audit.** All five onboarding fields and the paywall were audited at phone size. Found and fixed: the onboarding labels were not connected to their fields; the paywall had no dialog role, an unlabelled close button and no Escape key.
- **Field labels everywhere.** The same check, run on every screen and inner form, found 19 fields with no accessible name (quiz, planner, stats, costs, library, mock, study plan). All now have one.

Tested with simulated touch, pen and keyboard-size events in a desktop browser. None of it has been tried on a real phone, tablet or Apple Pencil.

## Priority order

1. **Stop losing work** (5.1 to 5.4): drafts for notes, sessions that survive a restart, and a clean return to login.
2. **One clear way to add to the calendar** (1.1 to 1.4), including click a day or hour to add.
3. **Tap targets** (2.1 to 2.4) and the small text (4.1).
4. **Layouts that fit the device** (3.1 to 3.4): desktop width, phone landscape, tablet portrait.
5. **Honest errors** (6.1 to 6.3): retry, an offline banner, one delete pattern.
6. **Gestures** (8.1, 8.2), then search and export (9.2, 9.3), then import (9.1).
7. Small fixes that can ride along with any of the above: 4.2, 4.3, 4.4, 10.2, 10.3.

Still open as decisions, not fixes: full offline use with sync (6.2 is only the stopgap).
