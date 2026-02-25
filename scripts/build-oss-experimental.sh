#!/usr/bin/env bash
set -euo pipefail

# Build react-server-dom-esm from React source for the oss-experimental/ folder.
#
# Usage:
#   ./scripts/build-oss-experimental.sh [--react-dir PATH] [--full]
#
# Prerequisites:
#   - yarn (React repo uses yarn workspaces)
#   - Node.js 18+
#   - java (for Google Closure Compiler, used by React's build)
#
# This script:
#   1. Clones facebook/react into ../react (or uses existing checkout)
#   2. Installs dependencies with yarn
#   3. Builds react-server-dom-esm (targeted) or full experimental channel
#   4. Runs packaging to create the publishable output
#   5. Copies results into oss-experimental/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
REACT_DIR="${REACT_DIR:-$(dirname "$PLUGIN_DIR")/react}"
OSS_DIR="$PLUGIN_DIR/oss-experimental"
FULL_BUILD=false

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --react-dir) REACT_DIR="$2"; shift 2 ;;
    --full) FULL_BUILD=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--react-dir PATH] [--full]"
      echo ""
      echo "Build react-server-dom-esm from React source."
      echo ""
      echo "Options:"
      echo "  --react-dir PATH  Path to React checkout (default: ../react)"
      echo "  --full            Build ALL packages (slow, ~15 min)"
      echo "                    Default: targeted build of react-server-dom-esm only (~2 min)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "Plugin dir:  $PLUGIN_DIR"
echo "React dir:   $REACT_DIR"
echo "Output dir:  $OSS_DIR"
echo "Full build:  $FULL_BUILD"
echo ""

# Step 1: Clone or update React
if [ ! -d "$REACT_DIR" ]; then
  echo "==> Cloning facebook/react (shallow)..."
  git clone --depth 1 https://github.com/facebook/react.git "$REACT_DIR"
else
  echo "==> Using existing React checkout at $REACT_DIR"
  echo "    Branch: $(cd "$REACT_DIR" && git branch --show-current 2>/dev/null || echo 'detached')"
  echo "    Commit: $(cd "$REACT_DIR" && git rev-parse --short HEAD)"
  echo ""
  read -p "    Pull latest? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    (cd "$REACT_DIR" && git pull)
  fi
fi

# Step 2: Install dependencies
echo ""
echo "==> Installing React dependencies (yarn)..."
cd "$REACT_DIR"

if ! command -v yarn &>/dev/null; then
  echo "ERROR: yarn is required but not installed."
  echo "Install with: npm install -g yarn"
  exit 1
fi

yarn install --frozen-lockfile 2>&1 | tail -5

# Step 3: Build
echo ""
if [ "$FULL_BUILD" = true ]; then
  echo "==> Building full React experimental channel (this takes ~15 min)..."
  RELEASE_CHANNEL=experimental node scripts/rollup/build-all-release-channels.js \
    --releaseChannel experimental 2>&1 | tail -20
else
  echo "==> Building react-server-dom-esm (targeted, ~2 min)..."
  echo "    (Use --full to build all packages)"
  echo ""

  # React's build.js accepts bundle names as positional args to filter.
  # We need react-server-dom-esm but it imports from shared React internals,
  # so we also need to build the core 'react' package first.
  #
  # RELEASE_CHANNEL=experimental ensures __EXPERIMENTAL__ is true.
  RELEASE_CHANNEL=experimental node scripts/rollup/build.js \
    react react-server-dom-esm 2>&1 | tail -30

  # Run packaging step to create the final publishable package structure
  # (copies files into build/oss-experimental/)
  echo ""
  echo "==> Running packaging..."
  RELEASE_CHANNEL=experimental node scripts/rollup/build-all-release-channels.js \
    --releaseChannel experimental --unsafe-partial 2>&1 | tail -20
fi

# Step 4: Copy to oss-experimental/
echo ""
echo "==> Copying packages to oss-experimental/..."

BUILD_BASE="$REACT_DIR/build/oss-experimental"

if [ ! -d "$BUILD_BASE" ]; then
  echo "ERROR: Build output not found at $BUILD_BASE"
  echo ""
  echo "If the targeted build didn't create the packaging output,"
  echo "try running with --full flag."
  exit 1
fi

mkdir -p "$OSS_DIR"

# Always copy react-server-dom-esm (the one we need)
for pkg in react-server-dom-esm react react-dom; do
  BUILD_PKG="$BUILD_BASE/$pkg"
  if [ -d "$BUILD_PKG" ]; then
    rm -rf "$OSS_DIR/$pkg"
    cp -r "$BUILD_PKG" "$OSS_DIR/$pkg"
    echo "  ✓ $pkg"
  else
    echo "  ✗ $pkg (not found in build output)"
  fi
done

# If full build, copy everything
if [ "$FULL_BUILD" = true ]; then
  for pkg in "$BUILD_BASE"/*/; do
    pkg_name=$(basename "$pkg")
    if [[ "$pkg_name" != "react" && "$pkg_name" != "react-dom" && "$pkg_name" != "react-server-dom-esm" ]]; then
      rm -rf "$OSS_DIR/$pkg_name"
      cp -r "$pkg" "$OSS_DIR/$pkg_name"
      echo "  ✓ $pkg_name"
    fi
  done
fi

# Report version
VERSION=$(python3 -c "import json; print(json.load(open('$OSS_DIR/react-server-dom-esm/package.json'))['version'])" 2>/dev/null || echo "unknown")
echo ""
echo "==> Done! react-server-dom-esm version: $VERSION"
echo "    Output: $OSS_DIR/"
echo ""
echo "Next steps:"
echo "  1. Update TEMPLATE_VERSION in bin/patch.mjs to:"
echo "     $VERSION"
echo "  2. Regenerate patches:"
echo "     npm run experimental:setup"
echo "  3. Test:"
echo "     npm run experimental:patch-react"
