#!/usr/bin/env bash
# Packed-consumer proof of the ROOT-INSTALL edge bake (bd y4l3): a server page
# importing a PACKAGE module that carries "use client" (router/client's Link),
# with the plugin installed at the project root — the one layout the repo's own
# fixtures cannot take (their plugin resolves by self-reference, which is
# always the hoisted path; the hoisted guard is edge-package-client-boundary).
#
# Under root install the main build hosts the client reference fine, but
# buildEdgeBundle bakes the barrel statically: the vendored CJS webpack flight
# client rides along and the bundler emits its CJS-interop preamble
# (`import { createRequire } from "node:module"`) into dist/server-edge —
# which a fetch runtime's validator rejects at deploy while every Node-based
# check stays green. This gate makes that class fail HERE instead.
#
# NOTE: npm pack's prepack wipes dist and re-emits it with tsc; run
# `npm run build` afterwards before any vitest gate.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

react_stable="$(node -p "require('$root/package.json').peerDependencies.react.split('||')[0].trim().replace(/^\^/, '')")"
stable_rsl="$(node -p "require('$root/package.json').peerDependencies['react-server-loader'].split('||')[0].trim().replace(/^\^/, '')")"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo "→ npm pack (the bytes a consumer installs)"
(cd "$root" && npm pack --loglevel=error --pack-destination "$workdir" >/dev/null)
tarball="$(ls "$workdir"/vite-plugin-react-server-*.tgz)"

dir="$workdir/consumer"
mkdir -p "$dir/src/page"
echo "→ root install: tarball + stable peers"
(cd "$dir" &&
  npm init -y >/dev/null &&
  npm pkg set type=module >/dev/null &&
  npm install --no-audit --no-fund --loglevel=error "$tarball" \
    "react@$react_stable" "react-dom@$react_stable" \
    "react-server-loader@$stable_rsl" vite@^8)

cat > "$dir/src/page/page.tsx" <<'EOF'
import { Link } from "vite-plugin-react-server/router/client";
export const Page = ({ name }: { name: string }) => (
  <div id="root">Hello {name} <Link to="/">home</Link></div>
);
EOF
cat > "$dir/src/page/props.ts" <<'EOF'
export const props = (_url: string) => ({ name: "root-install" });
EOF
cat > "$dir/src/client.tsx" <<'EOF'
import { startClient } from "vite-plugin-react-server/router/client";
startClient({ patterns: ["/"] });
EOF
cat > "$dir/index.html" <<'EOF'
<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>
EOF
cat > "$dir/vite.config.mjs" <<'EOF'
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      runner: "isolated",
      moduleBase: "src",
      Page: "src/page/page.tsx",
      props: "src/page/props.ts",
      transport: "webpack",
      build: { pages: ["/"], edge: true },
    }),
  ],
});
EOF

echo "→ vite build --app (root-install consumer)"
(cd "$dir" && npx vite build --app) 2>&1 | tail -20

echo "→ guard: no statically-evaluated node builtins in dist/server-edge"
(cd "$root" && node scripts/edge-builtin-guard.mjs "$dir/dist/server-edge")

echo "✓ root-install edge bake is deploy-clean"
