// `.` package entry under react-server condition resolution.
//
// Symmetric to index.client.ts: the shared factory in index.shared.ts builds the
// plugin through the neutral TLA dispatcher in
// orchestrator/createPluginOrchestrator.ts, so wrong-side ESM linking can't force
// module-init crashes. The explicit-side `vite-plugin-react-server/server`
// subpath still goes through plugin.server.ts directly, so consumers who
// explicitly opt into a side fail noisily under the wrong condition. See bd-6pi.

import { makeVitePluginReactServer } from "./index.shared.js";

export const vitePluginReactServer = makeVitePluginReactServer("react-server");
export const vitePluginReactClient = vitePluginReactServer;

export { createPluginOrchestrator, getCondition } from "./index.shared.js";
