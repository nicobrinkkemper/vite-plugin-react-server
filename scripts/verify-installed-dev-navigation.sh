#!/usr/bin/env bash
# Packed-consumer proof of dev client navigation: the README's minimal app
# (a server page importing Link from vite-plugin-react-server/router/client)
# plus a third-party "use client" package whose context provider is mounted by
# first-party client code, installed from tarballs into a fresh project and
# driven in Chromium against `vite` dev.
#
# An installed package is pre-bundled by Vite's dep optimizer for the browser.
# The repo's own fixtures resolve the plugin by self-reference (linked, never
# pre-bundled), so they cannot see a client reference that loads a second copy
# of a package next to its pre-bundle. This gate can: the Link has to navigate
# without a document load, and the package's component has to read the
# provider's context.
#
# NOTE: npm pack's prepack wipes dist and re-emits it with tsc; run
# `npm run build` afterwards before any vitest gate.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

react_stable="$(node -p "require('$root/package.json').peerDependencies.react.split('||')[0].trim().replace(/^\^/, '')")"
stable_rsl="$(node -p "require('$root/package.json').peerDependencies['react-server-loader'].split('||')[0].trim().replace(/^\^/, '')")"

workdir="$(mktemp -d)"
if [ "${KEEP:-}" != "1" ]; then trap 'rm -rf "$workdir"' EXIT; else echo "KEEP=1: $workdir"; fi

echo "→ npm pack (the bytes a consumer installs)"
(cd "$root" && npm pack --loglevel=error --pack-destination "$workdir" >/dev/null)
tarball="$(ls "$workdir"/vite-plugin-react-server-*.tgz)"

# A third-party package that ships one "use client" module holding a context:
# the provider and the reader must share it.
pkg="$workdir/ctx-pkg"
mkdir -p "$pkg"
cat > "$pkg/package.json" <<'EOF'
{
  "name": "ctx-pkg",
  "version": "1.0.0",
  "type": "module",
  "exports": "./index.js",
  "peerDependencies": { "react": "*" }
}
EOF
cat > "$pkg/index.js" <<'EOF'
"use client";
import * as React from "react";

const Ctx = React.createContext("none");

export function CtxProvider({ value, children }) {
  return React.createElement(Ctx.Provider, { value }, children);
}

export function CtxValue() {
  return React.createElement("output", { id: "ctx-value" }, React.useContext(Ctx));
}
EOF
(cd "$pkg" && npm pack --loglevel=error --pack-destination "$workdir" >/dev/null)
ctx_tarball="$workdir/ctx-pkg-1.0.0.tgz"

dir="$workdir/consumer"
mkdir -p "$dir/src/routes/about" "$dir/src/components"
echo "→ install: tarballs + stable peers"
(cd "$dir" &&
  npm init -y >/dev/null &&
  npm pkg set type=module >/dev/null &&
  npm install --no-audit --no-fund --loglevel=error "$tarball" "$ctx_tarball" \
    "react@$react_stable" "react-dom@$react_stable" \
    "react-server-loader@$stable_rsl" vite@8.1.0)

for linked in vite-plugin-react-server ctx-pkg; do
  if [ -L "$dir/node_modules/$linked" ]; then
    echo "✗ node_modules/$linked is a symlink; this gate needs a real install" >&2
    exit 1
  fi
done

cat > "$dir/vite.config.mjs" <<'EOF'
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    runner: "isolated",
    moduleBase: "src",
    routes: { dir: "routes" },
    transport: process.env.VPRS_TRANSPORT ?? "esm",
  }),
});
EOF
cat > "$dir/src/routes/page.tsx" <<'EOF'
import { Link } from "vite-plugin-react-server/router/client";
import { CtxValue } from "ctx-pkg";
import { Shell } from "../components/Shell.js";

export const Page = ({ title }: { title: string }) => (
  <main>
    <h1>{title}</h1>
    <Shell>
      <CtxValue />
    </Shell>
    <Link to="/about">About</Link>
  </main>
);
EOF
cat > "$dir/src/routes/props.ts" <<'EOF'
export const props = () => ({ title: "Hello from the server" });
EOF
cat > "$dir/src/routes/about/page.tsx" <<'EOF'
export const Page = () => <h1>About</h1>;
EOF
cat > "$dir/src/components/Shell.tsx" <<'EOF'
"use client";
import type { ReactNode } from "react";
import { CtxProvider } from "ctx-pkg";

export const Shell = ({ children }: { children?: ReactNode }) => (
  <CtxProvider value="shared">{children}</CtxProvider>
);
EOF
cat > "$dir/src/client.tsx" <<'EOF'
"use client";
import { startClient } from "vite-plugin-react-server/router/client";

startClient({
  moduleBaseURL: import.meta.env.BASE_URL,
  publicOrigin: import.meta.env.PUBLIC_ORIGIN,
});
EOF
cat > "$dir/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script>
  </body>
</html>
EOF

# Each transport starts from a cold optimizer cache, the state a fresh
# install boots in.
for transport in esm webpack; do
  rm -rf "$dir/node_modules/.vite"
  echo "→ vite dev, transport: $transport"
  (cd "$root" && VPRS_TRANSPORT="$transport" node scripts/installed-dev-navigation.mjs "$dir")
done

echo "✓ installed-package client references share the browser's module instances in dev"
