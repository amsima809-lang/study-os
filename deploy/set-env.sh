#!/bin/bash
# Set ONE setting of the trial copy on the Mac that hosts it (docs/DEPLOY_SUBPATH.md), then
# restart the service. The value is typed at a prompt: it is not shown on screen and does not
# end up in the shell's history or in a message.
# Run ON that Mac:  bash ~/termtrail/app/deploy/set-env.sh GOOGLE_MAPS_EMBED_KEY
set -euo pipefail
export PATH="${PATH:-}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
NAME="${1:?which setting? for example: GOOGLE_MAPS_EMBED_KEY}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "not a setting name: $NAME" >&2; exit 1; }
ENV_FILE="$HOME/termtrail/termtrail.env"
[ -f "$ENV_FILE" ] || { echo "no settings file at $ENV_FILE" >&2; exit 1; }

read -rsp "Value for $NAME (it will not be shown): " VALUE; echo
[ -n "$VALUE" ] || { echo "nothing entered: nothing changed" >&2; exit 1; }
case "$VALUE" in *[[:space:]\"\'#]*) echo "the value has a space, a quote or a #: nothing changed" >&2; exit 1 ;; esac

# Replace the line if the setting is already there, otherwise add it. The file stays private.
TMP="$(mktemp)"
grep -v "^${NAME}=" "$ENV_FILE" > "$TMP" || true
printf '%s=%s\n' "$NAME" "$VALUE" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$ENV_FILE"

BASE_PATH="$(grep -E '^BASE_PATH=' "$ENV_FILE" | cut -d= -f2-)"
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2-)"
launchctl kickstart -k "gui/$(id -u)/com.amsima.termtrail"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}${BASE_PATH}/api/health" >/dev/null 2>&1; then echo "$NAME is set, and the service is running again"; exit 0; fi
  sleep 1
done
echo "$NAME is set, but the service did not answer after the restart: see ~/termtrail/logs/termtrail.err.log" >&2
exit 1
