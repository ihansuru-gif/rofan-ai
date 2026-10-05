#!/usr/bin/env bash
set -Eeuo pipefail

collect_evidence() {
  adb logcat -d > StickerSheetMaker-emulator-logcat.txt || true
  adb shell dumpsys activity activities > StickerSheetMaker-emulator-activities.txt || true
  adb exec-out screencap -p > StickerSheetMaker-emulator-smoke.png || true
}
trap collect_evidence EXIT

APK_PATH="apk/app-debug.apk"
PACKAGE_NAME="com.oai.stickersheet"
ACTIVITY_NAME="com.oai.stickersheet/.MainActivity"

test -s "$APK_PATH"
adb install -r "$APK_PATH"
adb shell pm path "$PACKAGE_NAME" | grep -q '^package:'
adb shell am force-stop "$PACKAGE_NAME"
adb logcat -c
adb shell am start -n "$ACTIVITY_NAME" | tee StickerSheetMaker-am-start.txt

PID=""
for _ in {1..60}; do
  PID="$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r' || true)"
  if [[ -n "$PID" ]]; then
    break
  fi
  sleep 1
done
test -n "$PID"

RESUMED=""
for _ in {1..60}; do
  RESUMED="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' || true)"
  if grep -q "$ACTIVITY_NAME" <<<"$RESUMED"; then
    break
  fi
  sleep 1
done
grep -q "$ACTIVITY_NAME" <<<"$RESUMED"

if adb logcat -d -b crash | grep -q "$PACKAGE_NAME"; then
  echo "Crash buffer contains an entry for $PACKAGE_NAME" >&2
  exit 1
fi

adb exec-out screencap -p > StickerSheetMaker-emulator-smoke.png
test -s StickerSheetMaker-emulator-smoke.png
