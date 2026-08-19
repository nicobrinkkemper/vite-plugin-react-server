// The `.` package entry — ONE module for both conditions.
//
// IMPORTANT: this entry is what a consumer's `vite.config.ts` reaches as
// `import {...} from "vite-plugin-react-server"`. When Vite's
// `loadConfigFromFile` bundles that config, esbuild does NOT honor the
// `react-server` condition, so a condition-split entry pair here would let
// wrong-side ESM linking force module-init crashes. Instead this single
// neutral module routes through the TLA dispatcher in
// orchestrator/createPluginOrchestrator.ts, which picks the per-side
// implementation at runtime via Vite's dynamic-import-helper. The validated
// runner/condition invariant (plugin/config/runner.ts) guarantees the
// condition-picked side and the declared runner coincide.
//
// The explicit-side `vite-plugin-react-server/client` and `/server` subpaths
// still use the direct per-side plugin entries (plugin.client.ts /
// plugin.server.ts), so a consumer who explicitly opts into a side fails
// noisily under the wrong condition.

import { makeVitePluginReactServer } from "./index.shared.js";

export const vitePluginReactServer = makeVitePluginReactServer();
export const vitePluginReactClient = vitePluginReactServer;

export { createPluginOrchestrator, getCondition } from "./index.shared.js";
