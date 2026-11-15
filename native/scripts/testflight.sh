#!/bin/bash
# Build the iOS app and send it to TestFlight (docs/IOS_APP.md).
#
#   bash native/scripts/testflight.sh              build, sign and upload
#   bash native/scripts/testflight.sh --no-upload  build and sign only (the archive stays in native/build)
#
# Needs: Xcode with the owner's Apple account signed in (Xcode → Settings → Accounts), and, for
# the upload, the app already created in App Store Connect. Signing is automatic: the first run
# makes the signing certificate and registers the app's identifier on the developer account.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

npm install --no-audit --no-fund
npx cap sync ios

# Every upload needs a higher build number than the last: the time, to the minute (UTC).
BUILD="$(date -u +%Y%m%d%H%M)"
ARCHIVE="build/App-$BUILD.xcarchive"
mkdir -p build

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates CURRENT_PROJECT_VERSION="$BUILD" archive | tail -3

if [ "${1:-}" = "--no-upload" ]; then echo "Archive: native/$ARCHIVE (build $BUILD). Not uploaded."; exit 0; fi

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist scripts/ExportOptions.plist \
  -exportPath "build/export-$BUILD" -allowProvisioningUpdates | tail -5
echo "Build $BUILD is uploaded. It appears in App Store Connect → TestFlight after Apple has processed it (usually a few minutes)."
