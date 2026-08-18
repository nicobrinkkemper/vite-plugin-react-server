// Shared implementation for the `.` package entry. Both index.server.ts and
// index.client.ts build the same plugin factory and differ only in the
// `importContext` default they bake in ("react-server" vs "react-client").
//
// Both sides route through the NEUTRAL TLA dispatcher in
// orchestrator/createPluginOrchestrator.ts, which dispatches to the correct
// per-side implementation at runtime — so this shared module carries no
// static-linking hazard (it never imports a .server/.client subtree). See bd-6pi.

import type { VitePluginMainFn } from "./types.js";
import { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.js";
import type { UserOptions, Strategy } from "./orchestrator/types.js";
import { validateRunner } from "./config/runner.js";

export function makeVitePluginReactServer(
  importContext: Strategy["importContext"],
): VitePluginMainFn {
  return function _vitePluginReactServer(options, strategy?: Strategy) {
    if (options == null) {
      throw new Error("options is required");
    }

    // Runner/condition invariant: a declared runner either matches the
    // process condition or errors here, at config-resolve time.
    validateRunner((options as UserOptions).runner);

    const userStrategy = (options as UserOptions).strategy || {};
    const finalStrategy: Strategy = {
      mode: "auto",
      importContext,
      environmentTargets: new Map([
        ["client", "client"],
        ["ssr", "ssr"],
        ["server", "server"],
      ]),
      ...userStrategy,
      ...strategy,
    };
    return createPluginOrchestrator({
      ...options,
      strategy: finalStrategy,
    });
  };
}

export { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.js";
export { getCondition } from "./config/getCondition.js";
