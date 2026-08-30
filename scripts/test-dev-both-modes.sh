#!/usr/bin/env bash
# Runs the test/dev vitest suite twice — once under the react-server
# resolution condition (dev:rsc) and once without (dev:ssr).
#
# Background: the in-process Vite path (createServer used by
# test/dev/*) inherits the parent process's NODE_OPTIONS. With
# `--conditions react-server` the server bundle runs in dev:rsc mode;
# without it, the worker-driven dev:ssr code paths run instead. Each
# mode exercises a substantially different stack — only the dev:rsc
# branch was covered before this script (1.5.3-era CSS HMR
# regressions hit only because a dev:ssr-specific playwright e2e
# caught them).
#
# Each mode reports its own pass/fail line. The script exits non-zero
# if either mode failed, so CI can wire it as a single step.
#
# Usage:
#   ./scripts/test-dev-both-modes.sh [vitest-args...]
#
# Examples:
#   ./scripts/test-dev-both-modes.sh
#   ./scripts/test-dev-both-modes.sh test/dev/css-hmr.test.ts
#   ./scripts/test-dev-both-modes.sh --reporter=verbose

set -uo pipefail

ARGS=("$@")
[ ${#ARGS[@]} -eq 0 ] && ARGS=("test/dev")

run_mode() {
  local label="$1"
  local node_options="$2"
  echo ""
  echo "=== $label (NODE_OPTIONS='${node_options}') ==="
  TEST_MODE="$label" NODE_OPTIONS="$node_options" npx vitest run "${ARGS[@]}"
}

# Plain scalars, not `declare -A`: stock macOS ships bash 3.2, which has no
# associative arrays, and `#!/usr/bin/env bash` resolves to it on any Mac
# without a Homebrew bash ahead on PATH.
run_mode "dev:rsc" "--conditions react-server"
rsc_code=$?

run_mode "dev:ssr" ""
ssr_code=$?

report() {
  local mode="$1" code="$2"
  if [ "$code" -eq 0 ]; then
    printf "  %-10s OK\n" "$mode"
  else
    printf "  %-10s FAIL (exit %d)\n" "$mode" "$code"
    overall=1
  fi
}

echo ""
echo "=== summary ==="
overall=0
report "dev:rsc" "$rsc_code"
report "dev:ssr" "$ssr_code"
exit $overall
