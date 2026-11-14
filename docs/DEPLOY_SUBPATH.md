# A trial copy under a sub-path

For showing the app to someone before the real deploy (`DEPLOY.md`, Fly). The app runs on a Mac that is already reachable through a Cloudflare Tunnel, under a sub-path of an existing site.

**Live trial: https://amsima.com/termtrail** (since 14 November 2026, on the owner's Mac mini).

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
