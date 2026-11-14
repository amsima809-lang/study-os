# UX review plan

Status: planned, not started. Run it after the next round of features is in (agreed 2026-11-14).

Scope: every screen, on three device classes: phone, tablet and desktop.

## Before the review

Two items are architecture decisions, not review findings. Decide them first so the review can check against a chosen direction.

1. **Offline use with sync.** What happens with no network? Can the app be saved locally, and can changes made offline upload when the network returns? Doing this properly means a local database on the device, a queue of pending changes, and rules for conflicts when two devices edit the same thing.
2. **Native apps for Android and iOS.** Decided 2026-11-14: wrap the existing web app (Capacitor), because lecture transcripts need an in-app browser. See `LECTURE_TRANSCRIPTS_PLAN.md`. Still to settle within that route: notifications and Apple Pencil handling.

## How to run it

- **Devices:** a small iPhone (SE size), a mid-range Android phone, an iPad with Apple Pencil, and a desktop browser.
- **Real tasks:** walk through whole jobs, count taps, and note where people hesitate. Examples: photograph lecture slides and turn them into a quiz; find tomorrow's exam room; mark a course as passed; write a handwritten note and find it again a week later.
- **Real students:** after the checklist pass, watch two or three students use it. That finds what a checklist cannot.

## Checklist

### Layout and navigation
- [ ] Layout suits each device and uses the space well
- [ ] Navigation is easy; every screen is reachable in few steps
- [ ] Collapse and expand controls work properly
- [ ] Rotation, iPad split screen and Slide Over, notches and home indicators
- [ ] Returning to the app after hours away lands somewhere sensible

### Touch, gestures and stylus
- [ ] Gestures and multi-touch gestures are used where they help
- [ ] Stylus support (Apple Pencil: palm rejection on a real device, pressure, hover)
- [ ] Button size and spacing (comfortable tap targets, no crowded controls)

### Reading and looks
- [ ] Readability and clarity
- [ ] Aesthetics: colour palette and spacing
- [ ] Consistent patterns for the same action on every screen
- [ ] Thai text: line wrapping and truncation (Thai has no spaces between words), mixed Thai and English lines, Buddhist-era dates used consistently, labels that are longer in one language than the other

### Doing things
- [ ] Minimal actions to complete each task
- [ ] Appropriate friction for destructive actions (delete, sign out, overwrite)
- [ ] Visual feedback on every action; loading animations
- [ ] Protection against accidental double-taps, spamming and repeated submits
- [ ] Appropriate error states, with a way forward
- [ ] First run and empty states: what a new student sees before any notes, courses or exams exist

### Typing
- [ ] The on-screen keyboard on phones and tablets never hides the field being typed in or the controls needed while typing
- [ ] The keyboard is easy to open and dismiss

### Content in and out
- [ ] Importing materials is easy, from as many sources as possible (camera, photo library, files, PDFs, cloud drives, share sheet from other apps, paste)
- [ ] Search: finding an old note
- [ ] Export: getting notes out (PDF, images, share sheet)

### Not losing work
- [ ] A half-written note or handwritten page survives the phone locking, the tab being killed, or switching apps (autosave, draft recovery)
- [ ] Undo where it matters
- [ ] Behaviour with no network (see "Before the review")
- [ ] Sign-in expiring in the middle of a task
- [ ] The same account on two devices (phone and iPad)

### Accessibility
- [ ] Screen readers: VoiceOver and TalkBack, including Thai labels
- [ ] Large text: the device text-size setting and browser zoom to 200%
- [ ] Reduced motion setting is honoured
- [ ] No meaning carried by colour alone (for example exam red versus class dots)
- [ ] Contrast in every colour theme (the theme engine is audited; hard-coded colours are not)

### Speed
- [ ] First load on a mid-range Android phone on mobile data
- [ ] Photo and PDF upload sizes and times
- [ ] No distracting flash while fonts load

### Features with their own risks
- [ ] AI features: how long summaries and quizzes take, what shows while waiting, what happens on failure, how clearly the paywall explains itself
- [ ] Notifications and reminders: exam reminders exist in the database; on iPhone, web push only works once the app is added to the home screen (ties into the native-app decision)

## Output

A findings list per device class, each finding with a severity (blocks a task, slows a task, cosmetic), a screenshot, and a proposed fix. Then a prioritised fix list.
