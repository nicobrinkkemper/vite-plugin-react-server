#!/bin/bash
#
# validate-sibling.sh — validate this package against a sibling consumer via a
# real npm tarball (NOT a file: link, which masks version/packaging issues).
#
# Packs vite-plugin-react-server, installs the tarball into the sibling, runs the
# sibling's test command, then restores the sibling's node_modules. This is the
# on-demand integration loop — it is intentionally NOT wired into `test-all`, so
# the fast unit loop (`npm run test:inline-renderer`) stays the default and this
# only runs when you ask for it.
#
# Usage:
#   scripts/validate-sibling.sh <sibling-dir> [test-cmd...]
#   scripts/validate-sibling.sh ../bidoof-template "npm run test:e2e"
#   SKIP_BUILD=1 scripts/validate-sibling.sh ../bidoof-template   # reuse current dist/pack
#
# Knobs:
#   SKIP_BUILD=1   skip `npm run build` (use the existing dist)
#   KEEP=1         leave the tarball installed in the sibling (skip restore)
set -euo pipefail

SIBLING="${1:?usage: validate-sibling.sh <sibling-dir> [test-cmd...]}"
shift || true
TEST_CMD="${*:-npm run test:e2e}"

VPRS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SIBLING_DIR="$(cd "$SIBLING" && pwd)"
PKG_NAME="vite-plugin-react-server"

echo "▶ validate-sibling: $PKG_NAME → $SIBLING_DIR"
echo "  test cmd: $TEST_CMD"

cd "$VPRS_DIR"
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "▶ building $PKG_NAME (full: types + vite)…"
  npm run build
fi

echo "▶ packing tarball…"
rm -f "$PKG_NAME"-*.tgz
TARBALL="$(npm pack | tail -1)"
TARBALL_ABS="$VPRS_DIR/$TARBALL"
echo "  $TARBALL_ABS"

cd "$SIBLING_DIR"
echo "▶ installing tarball into sibling (no package.json change)…"
npm install "$TARBALL_ABS" --no-save

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    echo "▶ KEEP=1 — leaving tarball installed; restore with: (cd $SIBLING_DIR && npm ci)"
    return
  fi
  echo "▶ restoring sibling node_modules ($PKG_NAME)…"
  cd "$SIBLING_DIR"
  # Reinstall the version pinned in the lockfile, replacing the tarball copy.
  npm install "$PKG_NAME" --no-save >/dev/null 2>&1 || npm ci >/dev/null 2>&1 || true
  rm -f "$TARBALL_ABS"
}
trap cleanup EXIT

echo "▶ running sibling test command…"
set +e
eval "$TEST_CMD"
STATUS=$?
set -e

if [ $STATUS -eq 0 ]; then
  echo "✅ sibling validation passed: $SIBLING_DIR"
else
  echo "❌ sibling validation FAILED ($STATUS): $SIBLING_DIR"
fi
exit $STATUS
