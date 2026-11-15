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

The bundle identifier is **not registered with Apple yet** and can still be changed (in
`capacitor.config.json` and twice in `project.pbxproj`). Once the app exists in App Store Connect
it is permanent.

## What the first version does and does not do

It shows the trial site (`https://amsima.com/termtrail/`), so everything the web app does on an
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
- **Google sign-in will not work inside it** (Google refuses sign-in from a web view, and the link
  would open in Safari). The trial site signs in with the access code, which works.

## Before it can go to App Review

The shell is for the team's own testers on TestFlight. Apple's review is a different bar:

1. **Ship the web app inside the app** instead of loading it from the site. Apple rejects apps
   that are a website in a frame (guideline 4.2), and Capacitor itself says `server.url` is not
   for production. That means: the client built into `native/www`, the API address made
   absolute, and sign-in that works across sites (a web view blocks the session cookie from
   another site, so a token, or Capacitor's native HTTP).
2. **A production server and real sign-in.** If Google sign-in is offered, Apple requires
   Sign in with Apple beside it (guideline 4.8).
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

The first signed build makes a signing certificate and registers the bundle identifier on the
developer account, using the Apple account that Xcode is signed in to. The upload needs the app
to exist in App Store Connect first (My Apps → + → New App: iOS, the name, the bundle
identifier, an SKU).

## What has been checked

- The project compiles for iPhone, Debug and Release, unsigned (Xcode 27.2, iOS SDK 27.2).
- The built app carries the right identifier, version, name, permission texts and config.
- The "cannot connect" page, in a desktop browser at phone size: it renders, and "Try again"
  returns to the site.
- **Not checked: the app running.** The development machine has no iOS simulator and no phone
  attached, and running it needs a signed build.
