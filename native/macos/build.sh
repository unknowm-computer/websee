#!/bin/sh
set -eu

NATIVE_OS_VERSION=$(sw_vers -productVersion)
if [ "${NATIVE_OS_VERSION%%.*}" -lt 26 ]; then
  printf 'Apple 번역 도우미에는 macOS 26 이상이 필요합니다.\n' >&2
  exit 1
fi

NATIVE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NATIVE_APP="$NATIVE_ROOT/.build/WebSeeTranslation.app"
mkdir -p "$NATIVE_APP/Contents/MacOS"
xcrun swiftc -parse-as-library -O -target "$(uname -m)-apple-macosx26.0" \
  "$NATIVE_ROOT/Main.swift" "$NATIVE_ROOT/VisionOcr.swift" -o "$NATIVE_APP/Contents/MacOS/WebSeeTranslation"
cp "$NATIVE_ROOT/Info.plist" "$NATIVE_APP/Contents/Info.plist"
codesign --force --sign - "$NATIVE_APP"
printf '빌드 완료: %s\n' "$NATIVE_APP"
