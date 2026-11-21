# A trial copy under a sub-path

For showing the app to someone before the real deploy (`DEPLOY.md`, Fly). The app runs on a Mac that is already reachable through a Cloudflare Tunnel, under a sub-path of an existing site.

**Live trial: https://termtrail.com** (on the owner's Mac mini). It began on 14 November 2026
under a sub-path, `https://amsima.com/termtrail`, and moved to its own domain the next day
(Phase 66); the old address still answers, and sends every page on to the new one. The section
"After the move to termtrail.com" at the end says what changed. The rest of this page still
describes a copy under a sub-path, which the app can be served from at any time.

The access code is in `~/termtrail/termtrail.env` on that Mac (`DEV_LOGIN_CODE`), and a copy is kept on the development machine in `data/private/termtrail-trial-access-code.txt`, a folder git ignores. It is never written in the repository or in a message.

## What is different from the real deploy

| | Real deploy (Fly) | Trial copy |
|---|---|---|
| Address | the top of its own site | a sub-path: `BASE_PATH=/termtrail` |
| Sign-in | Google | the dev login, behind an access code: `ALLOW_DEV_LOGIN=true` + `DEV_LOGIN_CODE` |
| Listens on | every address (the container's) | `HOST=127.0.0.1`; the tunnel is the only way in |

The trial sign-in lets anyone who holds the access code sign in as **any email address** (there is no password per account). That is fine for a few reviewers with made-up data, and not for real students: do not put real personal data in the trial.

## Settings (`~/termtrail/termtrail.env`, readable by the owner only)

```
NODE_ENV=production
BASE_PATH=/termtrail
HOST=127.0.0.1
PORT=3300
APP_URL=https://amsima.com/termtrail
SESSION_SECRET=<long random text>
ALLOW_DEV_LOGIN=true
DEV_LOGIN_CODE=<the access code to hand to reviewers>
DB_PATH=/Users/<you>/termtrail-data/studyos.db
UPLOAD_DIR=/Users/<you>/termtrail-data/uploads
# ANTHROPIC_API_KEY=...   (without it the AI features say they are not set up; everything else works)
```

`BASE_PATH` is read twice: by the build (`BASE_PATH=/termtrail npm run build`, so every address in the page starts with it) and by the server (which mounts the whole app there). They must match.

## Where things are on the Mac

- code: `~/termtrail/app` (a checkout of the branch), settings: `~/termtrail/termtrail.env`, logs: `~/termtrail/logs`
- data: `~/termtrail-data` (database, uploads, and the daily backups the server makes in `backups/`)
- service: `~/Library/LaunchAgents/com.amsima.termtrail.plist` (from `deploy/com.amsima.termtrail.plist`)
- tunnel rule, in the tunnel's config file, above the site's catch-all rule:

```yaml
  - hostname: amsima.com
    path: ^/termtrail(/.*)?$
    service: http://127.0.0.1:3300
```

## Updating it

```bash
ssh <the Mac> 'bash ~/termtrail/app/deploy/update.sh'
```

It pulls the branch, installs, builds, runs the tests, restarts the service and waits for it to answer.

## Changing the access code

Edit `DEV_LOGIN_CODE` in `~/termtrail/termtrail.env`, then `launchctl kickstart -k gui/$(id -u)/com.amsima.termtrail`. People already signed in stay signed in.

## Taking it down

```bash
launchctl bootout gui/$(id -u)/com.amsima.termtrail
```

and remove the tunnel rule. The data stays in `~/termtrail-data`.

## Changing one setting

`bash ~/termtrail/app/deploy/set-env.sh NAME` asks for the value at a prompt (it is not shown),
writes it to `~/termtrail/termtrail.env`, restarts the service and checks it answers. For example
`GOOGLE_MAPS_EMBED_KEY`: with it, walking directions open on a Google map inside the app. Restrict
that key at Google to the Maps Embed API and to the site's address (`https://termtrail.com/*`).

## After the move to termtrail.com

The trial copy now sits at the top of its own domain. What is different from the settings above:

```
BASE_PATH=
APP_URL=https://termtrail.com
MOVED_FROM=https://amsima.com/termtrail,https://www.termtrail.com
```

- `BASE_PATH` is empty: the build and the server both serve from `/`. `deploy/update.sh` reads it
  from the file, so it needs no change.
- `MOVED_FROM` lists the old addresses. A request that still arrives at one is sent on to the
  same page under `APP_URL` (`server/src/moved.ts`): 302 for a page, 307 for anything else.
  `deploy/set-env.sh` refuses an empty value, so `BASE_PATH=` was edited in the file by hand.
- DNS, in the owner's Cloudflare account, zone `termtrail.com`: two proxied CNAME records,
  `@` and `www`, both to `<tunnel id>.cfargotunnel.com`.
- Tunnel rules, above the others in the same config file. The `amsima.com` rule for
  `/termtrail` stays, so that the old address reaches the server and is redirected:

```yaml
  - hostname: termtrail.com
    service: http://127.0.0.1:3300
  - hostname: www.termtrail.com
    service: http://127.0.0.1:3300
```

Sign-in there is now Google, for the test users listed in the owner's Google Cloud project
(`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are in the settings file). `ALLOW_DEV_LOGIN` and
`DEV_LOGIN_CODE` are still in the file and do nothing while a Google client is set.

What the move costs anyone who used the old address: they sign in again (the session cookie
belonged to the old site), turn notifications on again, and add the app to the Home Screen again
(all three belong to a site's address). The data is untouched.
