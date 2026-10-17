#!/usr/bin/env bash
# build.sh — portable, offline-friendly build for the AnalyzerX Android APK + Windows EXE.
#
# Tuned for constrained sandboxes and mobile-driven work: raises the heap, uses caches, fails fast,
# and verifies the artifacts it produces. Run it on your own machine or inside Dockerfile.build when
# the sandbox pod would time out on a heavy Gradle/Electron build.
#
# Usage:
#   ./build.sh                 # build everything (APK + EXE)
#   ./build.sh android         # APK only
#   ./build.sh windows         # EXE only
#   ./build.sh verify          # verify dist/ artifacts only
#
# Environment:
#   OFFLINE=1      add --offline to Gradle (only when the dependency cache is already warm)
#   GRADLE_FLAGS   extra flags for ./gradlew (default: --no-daemon)
set -Eeuo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/dist"
PNPM_VERSION="${PNPM_VERSION:-9.12.0}"
mkdir -p "$OUT"

# --- memory tuning (raise, never shrink) ----------------------------------- #
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
export GRADLE_OPTS="${GRADLE_OPTS:--Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError}"
GRADLE_FLAGS="${GRADLE_FLAGS:---no-daemon}"
[ "${OFFLINE:-0}" = "1" ] && GRADLE_FLAGS="$GRADLE_FLAGS --offline"

log()  { printf '\033[1;36m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[build:warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[build:error]\033[0m %s\n' "$*" >&2; exit 1; }

ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    log "installing pnpm@$PNPM_VERSION"
    npm install -g "pnpm@$PNPM_VERSION" || die "could not install pnpm"
  fi
  pnpm --version
}

preflight() {
  log "preflight: toolchains"
  command -v node >/dev/null 2>&1 || die "node not found — install Node 22+"
  command -v npm  >/dev/null 2>&1 || die "npm not found"
  ensure_pnpm
  if [ "$TARGET" != "windows" ]; then
    command -v java >/dev/null 2>&1 || die "java not found — install JDK 21"
    java -version 2>&1 | head -1
    if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
      warn "ANDROID_HOME / ANDROID_SDK_ROOT not set — the Android build will fail"
    fi
  fi
  node --version
}

deps() {
  log "deps: pnpm install --frozen-lockfile"
  ( cd "$ROOT" && pnpm install --frozen-lockfile )
}

build_android() {
  log "android: assembleRelease ($GRADLE_FLAGS)"
  [ -x "$ROOT/android/gradlew" ] || die "android/gradlew not found — run from the repo root"
  ( cd "$ROOT/android" && ./gradlew assembleRelease $GRADLE_FLAGS )
  local src="$ROOT/android/app/build/outputs/apk/release"
  [ -d "$src" ] || die "no release output at $src"
  find "$src" -maxdepth 1 -name '*.apk' -exec cp {} "$OUT/" \;
}

build_windows() {
  log "windows: web bundle + electron-builder"
  [ -f "$ROOT/desktop/package.json" ] || die "desktop/package.json not found"
  ( cd "$ROOT" && pnpm web:bundle )
  mkdir -p "$ROOT/desktop/app"
  cp -r "$ROOT/dist/web/." "$ROOT/desktop/app/"
  cp "$ROOT/public/index.html" "$ROOT/desktop/app/index.html"
  ( cd "$ROOT/desktop" && npm install --no-audit --no-fund && npx electron-builder --win --publish never )
  find "$ROOT/desktop/release" -maxdepth 1 -name '*.exe' -exec cp {} "$OUT/" \;
}

verify() {
  log "verify: artifacts in $OUT"
  shopt -s nullglob
  local n=0 f sz magic
  for f in "$OUT"/*.apk "$OUT"/*.exe; do
    n=$((n + 1))
    sz="$(stat -c%s "$f" 2>/dev/null || echo 0)"
    [ "$sz" -gt 0 ] || die "artifact is 0 bytes: $f"
    magic="$(head -c 2 "$f" | od -An -tx1 | tr -d ' \n')"
    case "$f" in
      *.apk) [ "$magic" = "504b" ] || die "not a valid APK (bad magic $magic): $f" ;;
      *.exe) [ "$magic" = "4d5a" ] || die "not a valid EXE (bad magic $magic): $f" ;;
    esac
    log "ok: $(basename "$f") ($sz bytes)"
  done
  [ "$n" -gt 0 ] || die "no artifacts produced in $OUT"
  log "verified $n artifact(s)"
}

case "$TARGET" in
  all)     preflight; deps; build_android; build_windows; verify ;;
  android) preflight; deps; build_android; verify ;;
  windows) preflight; deps; build_windows; verify ;;
  verify)  verify ;;
  *)       die "unknown target '$TARGET' (use: all|android|windows|verify)" ;;
esac

log "done — artifacts in $OUT"
