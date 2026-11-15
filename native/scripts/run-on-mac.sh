#!/bin/bash
# Run the iOS app on this Mac (Apple silicon), without a simulator or a phone.
#
#   bash native/scripts/run-on-mac.sh
#
# Builds a signed Debug copy for "My Mac (Designed for iPad)" and opens it. The first
# time, Xcode registers this Mac as a test device on the developer account.
#
# An iOS app cannot be opened on a Mac by itself ("incorrect executable format"): it has
# to sit inside a wrapper bundle, the way App Store iPhone apps do on a Mac.
set -euo pipefail

cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

npm install --no-audit --no-fund >/dev/null
npx cap sync ios >/dev/null

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=macOS,arch=arm64,variant=Designed for iPad' \
  -derivedDataPath build/dd-mac \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  build | tail -3

NAME=$(node -p "require('./capacitor.config.json').appName")
OUT="build/mac-run/$NAME.app"
rm -rf build/mac-run
mkdir -p "$OUT/Wrapper"
cp -R build/dd-mac/Build/Products/Debug-iphoneos/App.app "$OUT/Wrapper/"
ln -s Wrapper/App.app "$OUT/WrappedBundle"

open "$OUT"
echo "Opened native/$OUT"
