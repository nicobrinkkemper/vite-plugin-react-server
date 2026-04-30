// `.` package entry under default (react-client) resolution.
//
// IMPORTANT: this entry is the one a consumer's `vite.config.ts` reaches
// when imported as `import {...} from "vite-plugin-react-server"`. When
// Vite's `loadConfigFromFile` bundles that config, esbuild does NOT honor
// the `react-server` condition — even if Node will run the bundle under
// react-server, esbuild picks the `default` (client) entry and bundles
// the .client subtree. To stay safe, this entry's `vitePluginReactServer`
// uses the neutral TLA dispatcher in `orchestrator/createPluginOrchestrator.ts`,
// which dispatches to the correct side at runtime via Vite's
// dynamic-import-helper. See bd-6pi.
//
// The explicit-side `vite-plugin-react-server/client` and
// `vite-plugin-react-server/server` subpaths still use the direct
// per-side plugin entries (plugin.client.ts / plugin.server.ts) so a
// consumer who explicitly opts into the wrong side gets a noisy failure.

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
      importContext: "react-client",
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
