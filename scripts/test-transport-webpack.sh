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

./scripts/test-both.sh \
  test/dev/dev-transport-hint.test.ts \
  test/dev/server-actions.test.ts \
  test/dev/client-imports-server-action.test.ts \
  test/dev/suspense-flight-roundtrip.test.ts
