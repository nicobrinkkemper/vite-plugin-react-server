#!/usr/bin/env bash
# Packed-consumer proof of the react-server-loader PEER contract: pack the
# plugin, install the tarball into a fresh consumer on each React track
# (stable, and the exact experimental snapshot the peer range names), and
# assert exactly one copy of react / react-dom / react-server-loader resolves.
# Single-copy resolution is the point of the peer layout, and only a real
# install can prove it — the repo's own fixtures resolve by self-reference.
#
# NOTE: npm pack's prepack wipes dist and re-emits it with tsc; run
# `npm run build` afterwards before any vitest gate.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The stable track installs the EXACT minimum of each peer range (caret
# stripped), not the range: a ranged install floats to the latest patch and
# masks a lower-bound mismatch between vprs's React floor and the floor its
# react-server-loader peer declares.
peer_range="$(node -p "require('$root/package.json').peerDependencies['react-server-loader']")"
stable_rsl="$(node -p "\"$peer_range\".split('||')[0].trim().replace(/^\^/, '')")"
exp_rsl="$(node -p "\"$peer_range\".split('||').map(s=>s.trim()).find(s=>s.startsWith('0.0.0-experimental-')) ?? ''")"
react_stable="$(node -p "require('$root/package.json').peerDependencies.react.split('||')[0].trim().replace(/^\^/, '')")"

if [ -z "$exp_rsl" ]; then
  echo "✗ peerDependencies['react-server-loader'] no longer names an exact experimental snapshot: $peer_range" >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo "→ npm pack (the bytes a consumer installs)"
(cd "$root" && npm pack --loglevel=error --pack-destination "$workdir" >/dev/null)
tarball="$(ls "$workdir"/vite-plugin-react-server-*.tgz)"

check_track() {
  local track="$1"
  shift
  local dir="$workdir/consumer-$track"
  mkdir -p "$dir"
  echo "→ $track: npm install $*"
  (cd "$dir" &&
    npm init -y >/dev/null &&
    npm install --no-audit --no-fund --loglevel=error "$tarball" "$@")

  # A broken tree (missing or invalid peers) fails npm ls even when the
  # install itself succeeded.
  (cd "$dir" && npm ls react react-dom react-server-loader vite-plugin-react-server >/dev/null)

  local pkg count
  for pkg in react react-dom react-server-loader; do
    count="$(find "$dir/node_modules" -type d -path "*/node_modules/$pkg" | wc -l)"
    if [ "$count" -ne 1 ]; then
      echo "✗ $track: expected exactly 1 copy of $pkg, found $count:" >&2
      find "$dir/node_modules" -type d -path "*/node_modules/$pkg" >&2
      exit 1
    fi
  done
  echo "  ✓ one copy each of react, react-dom, react-server-loader"
}

check_track stable "react@$react_stable" "react-dom@$react_stable" "react-server-loader@$stable_rsl"
check_track experimental "react@$exp_rsl" "react-dom@$exp_rsl" "react-server-loader@$exp_rsl"

echo "✓ packed-consumer peer install verified on both tracks"
