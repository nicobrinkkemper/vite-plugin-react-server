#!/usr/bin/env bash
# Webpack-transport matrix: rerun curated transport-agnostic suites with
# transport:"webpack" (via the VPRS_TEST_TRANSPORT knob in test-config.ts),
# the way test-both.sh reruns both React conditions.
#
# Deliberately NOT a blanket rerun: suites whose assertions encode esm
# artifacts by design (bare module-path reference rows, esm SSG pass events,
# maybeInlineFlight, snapshots without a bake) fail under webpack by design
# and stay esm-only, as do fixtures with build.edge:false (webpack requires
# the baked pair and refuses to configure without it). Grow this list one
# verified-green suite at a time.
set -euo pipefail
cd "$(dirname "$0")/.."

export VPRS_TEST_TRANSPORT=webpack

SUITES=(
  test/dev/dev-transport-hint.test.ts
  test/dev/server-actions.test.ts
  test/dev/client-imports-server-action.test.ts
  test/dev/suspense-flight-roundtrip.test.ts
  test/dev/hmr.test.ts
)

./scripts/test-both.sh "${SUITES[@]}"

# Parity leg: the same suites under a subpath base. Transport must never be
# a base-sensitivity dimension — the webpack chunk loader resolving ids
# through PUBLIC_ORIGIN + BASE_URL (flightClient.browser resolveChunkUrl)
# is what this guards. The plugin reads the VITE_-prefixed value; a bare
# BASE_URL export is ignored and silently reruns the root base.
export VITE_BASE_URL='/test-base-url/'
./scripts/test-both.sh "${SUITES[@]}"
