# The iOS app

`native/` holds an iPhone and iPad app for Termtrail. It is a **shell**: a native app with one
web view that shows the same web app, from the same server, that a browser shows. Nothing about
the web app changes when the shell is built, and nothing in `native/` is needed to run or deploy
the web app.

It is made with Capacitor 8 (the route `LECTURE_TRANSCRIPTS_PLAN.md` chose for the later in-app
browser). Capacitor's native code comes in through Swift Package Manager, so no CocoaPods.

## What is where

| Path | What it is |
|---|---|
| `native/capacitor.config.json` | The app's identifier, name, and the address it shows (`server.url`). |
| `native/www/` | The only page inside the app itself: "cannot connect", with a try-again button. Shown when the site cannot be reached. Plain HTML, no build. |
| `native/ios/App/` | The Xcode project (committed). `App/Info.plist` has the permission texts; `App/Assets.xcassets` the icon and launch screen. |
| `native/scripts/testflight.sh` | Build, sign and upload to TestFlight. |
| `native/scripts/run-on-mac.sh` | Build a signed Debug copy and open it on an Apple silicon Mac. |
| `native/scripts/ExportOptions.plist` | Upload settings. Builds are marked **internal testers only**. |

Generated, do not edit by hand: the icon and launch images (`node scripts/make-icons.mjs`, from
the logo), `native/ios/App/App/public/` and `native/ios/App/App/capacitor.config.json`
(`npm run sync` in `native/`, after changing `capacitor.config.json` or `www/`).

The app's name is kept in step with the web app by `node scripts/rename-app.mjs`
(`server/test/brand.test.ts` fails if it drifts).

## The identity

| | |
|---|---|
| Bundle identifier | `com.patrick.termtrail` |
| Developer team | Patrick Tanna, `D3KJUN7ZQH` (individual) |
| Version | `0.1.0`; the build number is the upload time, set by the script |
| Runs on | iPhone and iPad, iOS 15 or later |

On the developer account (2026-11-15), all made by Xcode's automatic signing:

- an **Apple Development** certificate, in the development machine's keychain;
- the bundle identifier `com.patrick.termtrail`, registered as an App ID, with its App Store
  profile ("iOS Team Store Provisioning Profile: com.patrick.termtrail"). Distribution signing
  is Apple's cloud-managed certificate, so there is no distribution key to keep;
- the development Mac, registered as a test device (so the app can run on it).

In App Store Connect (2026-11-15): the app **Termtrail**, Apple ID `6835044878`, iOS, primary
language Thai, SKU `termtrail-ios`, all users of the account have access. The bundle identifier
is therefore **permanent**. The first build, `0.1.0 (202611150853)`, is uploaded to TestFlight.

TestFlight has one internal group, **Termtrail team**, with automatic distribution on (every
build `testflight.sh` uploads goes to the group by itself; Apple does not let that be changed
later). A tester must first be a user of the App Store Connect account
(Users and Access → +, Developer role, access to Termtrail only: the form ticks every app by
default) and **must accept that invitation** before the group's "Add Testers" list shows them.

The group has two testers since 2026-11-15, the owner and the repository owner (status
"Invited": TestFlight has emailed each; they install the TestFlight app on the iPhone, signed in
with that same Apple ID, and accept there). Being the account holder does not make someone a
tester: they must be added to the group like anyone else.

Xcode refuses to sign when the account has an updated Program License Agreement waiting
("PLA Update available"). Only the account holder can accept it, at developer.apple.com/account.

## What the first version does and does not do

It shows the trial site (`https://termtrail.com/`), so everything the web app does on an
iPhone in Safari, it does here, with these differences:

- **Links to other sites** (Google Maps directions, the university's lecture pages) leave the app
  and open in Safari or the Maps app. The Google map inside the directions sheet stays in the app.
- **Location** ("Where am I?", walking directions) and the **camera** (photographing notes) ask
  through iOS, with the texts in `Info.plist`.
- **No notifications when the app is closed.** A web view has no web push; that needs Apple's push
  service and native code. The Reminders screen says so (`inNativeApp()` in
  `client/src/native.ts`) and points to the Home Screen web app, which does have them.
- **No offline cache.** A web view has no service worker by default, so with no connection the
  app shows its "cannot connect" page instead of the last-seen screens.
- **Not checked:** downloading a file (the calendar export, a note as a text file) and printing a
  note. Web views handle neither by themselves.
- **Google sign-in** goes through the system's sign-in sheet (Phase 65, below). It is the trial
  site's only way to sign in.

## Signing in with Google

Google refuses a sign-in inside an app's web view. So, in the app, the login page's Google
button calls the app's own plugin (`native/ios/App/App/AppSignIn.swift`), which opens the site's
sign-in in the system sign-in sheet: a real browser that shares Safari's cookies, so someone
already signed in to Google there only has to tap their account. iOS first asks "Termtrail wants
to use termtrail.com to sign in".

The sheet is not the app, so it cannot pass on a session. It comes back to the app with a
one-time code, and the page in the app exchanges the code for its own session
(`server/src/appSignIn.ts` explains what keeps that code from being worth stealing).

What it needs:

- **On the server:** Google sign-in set up as for any browser (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `APP_URL`; `docs/DEPLOY.md`). The app uses the same web client: no
  iOS client, nothing added in Google Cloud. `IOS_APP_SCHEME` is the app's bundle identifier
  by default.
- **In the app:** build `202611151316` (on TestFlight, 2026-11-15) or later. Every earlier build
  shows "this version cannot sign in with Google yet": Capacitor's `SceneDelegate.swift` builds
  the app's screen in code, and it built a plain `CAPBridgeViewController` instead of the app's
  own `MainViewController`, so the plugin was never registered (the storyboard was changed, but
  the app does not use it). Found with a probe page that reports what the app gives the page;
  `server/test/appSignIn.test.ts` now checks `SceneDelegate`. Builds before `202611151106` also
  open the old address (`amsima.com/termtrail`), which leaves the app for Safari.

Setting a Google client on a site **switches its access-code login off**.

The Google side exists (2026-11-15), in the owner's Google Cloud project **Termtrail** (project
ID `termtrail`), separate from his other projects so that Google's sign-in screen says
"Termtrail":

- the sign-in screen: app name Termtrail, external users, publishing status **Testing**. In
  Testing only the listed test users can sign in (two are listed), so the trial stays private
  without the access code. Adding a tester: Google Auth Platform → Audience → Add users.
  Publishing it ("In production") opens sign-in to every Google account;
- the web client **Termtrail web**, with the redirect address
  `https://termtrail.com/api/auth/google/callback` (and the old site's, kept for now). Its ID is
  on the Clients page; its secret is shown once, when it is made: Google does not show it again,
  and a lost one is replaced with "Add secret" on the client's page.

The client is on the trial server since 15 November 2026, so the access-code login is off
there. When setting a client on a server, put the secret on first, then the ID: the ID is what
switches Google on (`bash deploy/set-env.sh GOOGLE_CLIENT_SECRET`, then `GOOGLE_CLIENT_ID`, on
the host). Checked from outside: both the browser's and the app's sign-in address hand over to
Google with the right client and return address, and Google answers with its sign-in page.

An account is matched by its email address, ignoring capitals: someone who typed their address
with a capital at the access-code login gets the same account when Google reports it in
lowercase.

In a browser, the owner has signed in with his Google account (15 November 2026). Not tried:
the app's own path, which is the real sign-in sheet on a phone. For the app, everything after
Google was tried with a stand-in for Google, and the login page with a simulated plugin.

## Before it can go to App Review

The shell is for the team's own testers on TestFlight. Apple's review is a different bar:

1. **Ship the web app inside the app** instead of loading it from the site. Apple rejects apps
   that are a website in a frame (guideline 4.2), and Capacitor itself says `server.url` is not
   for production. That means: the client built into `native/www`, the API address made
   absolute, and sign-in that works across sites (a web view blocks the session cookie from
   another site, so a token, or Capacitor's native HTTP).
2. **A production server and real sign-in.** Google sign-in now works in the app, so wherever it
   is switched on Apple requires Sign in with Apple beside it (guideline 4.8).
3. **Something native**: notifications through Apple's push service is the obvious first one.
4. A privacy policy address, the App Privacy answers, screenshots, and a support address.
5. Remove `testFlightInternalTestingOnly` from `ExportOptions.plist`.

## Building

Xcode 27 is installed but is not the selected toolchain on the development machine, so commands
set `DEVELOPER_DIR` (the script does it). To compile without signing, which touches nothing on
the Apple account:

```bash
cd native && npm install && npx cap sync ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/App/App.xcodeproj \
  -scheme App -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

To sign and upload (`--no-upload` stops after signing):

```bash
bash native/scripts/testflight.sh
```

Signing uses the Apple account that Xcode is signed in to. The archive is signed for
development with the team's wildcard profile; the export step re-signs it for the App Store
with the app's own profile. The upload needs the app to exist in App Store Connect first
(My Apps → + → New App: iOS, name "Termtrail", primary language Thai, bundle identifier
`com.patrick.termtrail`, SKU `termtrail-ios`).

To run it on an Apple silicon Mac, with no simulator and no phone:

```bash
bash native/scripts/run-on-mac.sh
```

An iOS app does not open on a Mac by itself ("incorrect executable format"); the script puts it
in the wrapper bundle that App Store iPhone apps use on a Mac.

## What has been checked

- The project compiles for iPhone, Debug and Release, unsigned (Xcode 27.2, iOS SDK 27.2).
- The built app carries the right identifier, version, name, permission texts and config.
- The "cannot connect" page, in a desktop browser at phone size: it renders, and "Try again"
  returns to the site.
- Signing and upload: the archive signs for development, exports signed for the App Store, and
  `testflight.sh` uploaded build `202611150853`, which App Store Connect lists under TestFlight.
- On the development Mac (`run-on-mac.sh`): the app starts and stays running, with no crash
  report.
- Google sign-in (Phase 65): the server's part with a stand-in for Google, the login page with a
  simulated plugin, the plugin's limit on what it opens; the app compiles and signs with it.
- **Not checked: what the app shows.** Nobody has looked at its window yet, so sign-in, the
  links that leave the app, the camera and location prompts, and the "cannot connect" page
  inside the real app are all untested. Nor has it run on a phone.

### Notes and lectures, 16 November 2026

In build `202611160958`, **My Notes → + Add note → Pen** opens PencilKit inside the writing field. Dragging the top of the tray changes its height. Build `202611160932` introduced the half-screen PencilKit editor for summary annotations. Older builds use the web pen tools where needed. Standalone notes use the full-page editor. Build `202611160616` introduced native Thai and English dictation. The web app serves the prebuilt lecture library to the two trial accounts.

On a physical iPad, open Pen, rest a palm while writing, tap Done, reopen the ink, save and check the image. In a lecture summary, underline a phrase with the Pencil, scroll to **My Notes** above the editor, then save and reopen the annotation. Tap Speak, dictate a sentence, stop and check the saved note. These device checks remain open.
