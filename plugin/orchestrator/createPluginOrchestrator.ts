// createPluginOrchestrator.ts — neutral runtime-dispatch shim.
//
// This file is the dispatch point that lets the plugin work even when ESM
// static linking forces the wrong-side tree to be evaluated. The .client
// tree contains modules that, at module-init, require `react-dom/server`
// from the consumer's project — which under --conditions=react-server
// resolves to `server.react-server.js` and throws by design. The .server
// tree is symmetric (less acutely so, but still: a .server module pulled in
// under react-client is a category error).
//
// In normal Node resolution, a consumer's `import "vite-plugin-react-server"`
// goes through the package.json `exports` map and picks `.server` or
// `.client` based on the active `--conditions`. But the bundler that loads
// a consumer's `vite.config.ts` (esbuild via Vite's `loadConfigFromFile`)
// DOES NOT honor the `react-server` condition. It bundles the `.client`
// chain regardless. When Node then runs that bundle under react-server,
// vendor.client's `require("react-dom/server")` blows up.
//
// To stay safe under wrong-side bundling, this neutral file does NOT
// statically link `.server.js` or `.client.js`. It uses an interpolated
// dynamic import — Vite's dynamic-import-helper detects the template
// literal pattern at bundle time and emits a runtime helper that bundles
// BOTH candidates and picks one based on the resolved string at execution.
// That's the only escape hatch the bd-6pi rule allows for genuinely
// runtime-dispatched code, and the orchestrator is exactly that case.
//
// PR #27 removed this dispatch on the assumption that conditional
// `exports` would be sufficient. They aren't, because esbuild bundles
// without honoring them; bd-6pi tracks the resulting bidoof regression.

import type { Plugin } from "vite";
import { getCondition } from "../config/getCondition.js";
import type { UserOptions } from "./types.js";

const condition = getCondition();
const dirpath = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

const mod = (await import(
  `${dirpath}/createPluginOrchestrator.${condition === "react-server" ? "server" : "client"}.js`
)) as {
  createPluginOrchestrator: (userOptions: UserOptions) => Plugin[];
};

export const { createPluginOrchestrator } = mod;
