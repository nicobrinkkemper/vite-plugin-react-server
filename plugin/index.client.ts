// `.` package entry under default (react-client) resolution.
//
// IMPORTANT: this entry is the one a consumer's `vite.config.ts` reaches when
// imported as `import {...} from "vite-plugin-react-server"`. When Vite's
// `loadConfigFromFile` bundles that config, esbuild does NOT honor the
// `react-server` condition — even if Node will run the bundle under react-server,
// esbuild picks the `default` (client) entry. To stay safe, the shared factory in
// index.shared.ts builds the plugin through the neutral TLA dispatcher in
// orchestrator/createPluginOrchestrator.ts, which dispatches to the correct side
// at runtime via Vite's dynamic-import-helper. See bd-6pi.
//
// The explicit-side `vite-plugin-react-server/client` and `/server` subpaths
// still use the direct per-side plugin entries (plugin.client.ts /
// plugin.server.ts) so a consumer who explicitly opts into the wrong side gets a
// noisy failure.

import { makeVitePluginReactServer } from "./index.shared.js";

export const vitePluginReactServer = makeVitePluginReactServer("react-client");
export const vitePluginReactClient = vitePluginReactServer;

export { createPluginOrchestrator, getCondition } from "./index.shared.js";
