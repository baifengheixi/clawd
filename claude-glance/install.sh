#!/bin/zsh
# Builds ClaudeGlance.saver, installs it, and sets up a launchd job that refreshes stats every 5 minutes.
set -euo pipefail
cd "${0:A:h}"
DIR="$PWD"
B="build/ClaudeGlance.saver/Contents"
rm -rf build && mkdir -p "$B/MacOS"

cat > "$B/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>local.claude-glance</string>
  <key>CFBundleName</key><string>Claude Glance</string>
  <key>CFBundleExecutable</key><string>ClaudeGlance</string>
  <key>CFBundlePackageType</key><string>BNDL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>NSPrincipalClass</key><string>ClaudeGlanceView</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PLIST

for arch in arm64 x86_64; do
  swiftc -O -target $arch-apple-macos13 -module-name ClaudeGlance -emit-library \
    -Xlinker -bundle -o build/ClaudeGlance-$arch ClaudeGlanceView.swift \
    -framework ScreenSaver -framework AppKit
done
lipo -create build/ClaudeGlance-* -output "$B/MacOS/ClaudeGlance"
codesign --force --sign - build/ClaudeGlance.saver

mkdir -p ~/Library/Screen\ Savers
rm -rf ~/Library/Screen\ Savers/ClaudeGlance.saver
cp -R build/ClaudeGlance.saver ~/Library/Screen\ Savers/
killall legacyScreenSaver 2>/dev/null || true   # drop any cached old build

NODE="$(command -v node)"
PL=~/Library/LaunchAgents/local.claude-glance.plist
cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.claude-glance</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/collect.mjs</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$HOME/.claude-glance/collect.log</string>
</dict></plist>
PLIST
mkdir -p ~/.claude-glance
launchctl bootout gui/$(id -u) "$PL" 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PL"

echo "Installed. System Settings → Screen Saver → choose 'ClaudeGlance'."
