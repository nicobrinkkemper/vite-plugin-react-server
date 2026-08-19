// Shared implementation for the `.` package entry (plugin/index.ts).
//
// Routes through the NEUTRAL TLA dispatcher in
// orchestrator/createPluginOrchestrator.ts, which dispatches to the correct
// per-side implementation at runtime — so this module carries no
// static-linking hazard (it never imports a .server/.client subtree).

import type { VitePluginMainFn } from "./types.js";
import { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.js";
import type { UserOptions, Strategy } from "./orchestrator/types.js";
import { validateRunner } from "./config/runner.js";

export function makeVitePluginReactServer(): VitePluginMainFn {
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
