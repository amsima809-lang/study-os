#!/bin/bash
# Update the trial copy on the Mac that hosts it (docs/DEPLOY_SUBPATH.md).
# Run ON that Mac:  bash ~/termtrail/app/deploy/update.sh
# It pulls the branch, installs, builds for the sub-path in the env file, and restarts the service.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
APP="$HOME/termtrail/app"; ENV_FILE="$HOME/termtrail/termtrail.env"
BASE_PATH="$(grep -E '^BASE_PATH=' "$ENV_FILE" | cut -d= -f2-)"
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2-)"
cd "$APP"
git pull --ff-only
npm ci
BASE_PATH="$BASE_PATH" npm run build
npm test
launchctl kickstart -k "gui/$(id -u)/com.amsima.termtrail"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}${BASE_PATH}/api/health" >/dev/null 2>&1; then echo "updated and healthy: $(git log --oneline -1)"; exit 0; fi
  sleep 1
done
echo "the service did not answer after the restart: see ~/termtrail/logs/termtrail.err.log" >&2
exit 1
