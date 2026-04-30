// `.` package entry under react-server condition resolution.
//
// Symmetric to index.client.ts: uses the neutral TLA dispatcher in
// `orchestrator/createPluginOrchestrator.ts` to keep wrong-side ESM
// linking from forcing module-init crashes. The explicit-side
// `vite-plugin-react-server/server` subpath still goes through
// plugin.server.ts directly, so consumers who explicitly opt into a side
// fail noisily under the wrong condition. See bd-6pi.

import type { VitePluginMainFn } from "./types.js";
import { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.js";
import type { UserOptions, Strategy } from "./orchestrator/types.js";

export const vitePluginReactServer: VitePluginMainFn =
  function _vitePluginReactServer(options, strategy?: Strategy) {
    if (options == null) {
      throw new Error("options is required");
    }
    const userStrategy = (options as UserOptions).strategy || {};
    const finalStrategy: Strategy = {
      mode: "auto",
      importContext: "react-server",
      environmentTargets: new Map([["client", "client"], ["ssr", "ssr"], ["server", "server"]]),
      ...userStrategy,
      ...strategy,
    };
    return createPluginOrchestrator({
      ...options,
      strategy: finalStrategy,
    });
  };

export const vitePluginReactClient = vitePluginReactServer;
export { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.js";
export { getCondition } from "./config/getCondition.js";
