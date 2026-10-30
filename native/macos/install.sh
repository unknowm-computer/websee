#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  printf '사용법: sh native/macos/install.sh <WebSee 확장 프로그램 ID>\n' >&2
  exit 1
fi
for extension_id in "$@"; do
  if ! printf '%s\n' "$extension_id" | LC_ALL=C grep -Eq '^[a-p]{32}$'; then
    printf '올바르지 않은 확장 프로그램 ID: %s\n' "$extension_id" >&2
    exit 1
  fi
done

NATIVE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$NATIVE_ROOT/build.sh"
NATIVE_INSTALL_ROOT="$HOME/Library/Application Support/WebSee"
mkdir -p "$NATIVE_INSTALL_ROOT"
ditto "$NATIVE_ROOT/.build/WebSeeTranslation.app" "$NATIVE_INSTALL_ROOT/WebSeeTranslation.app"
"$NATIVE_INSTALL_ROOT/WebSeeTranslation.app/Contents/MacOS/WebSeeTranslation" --install "$@"
