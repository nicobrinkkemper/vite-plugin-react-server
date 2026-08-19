import type { VitePluginMainFn } from "./types.js";
import type { UserOptions, Strategy } from "./orchestrator/types.js";

import { assertReactServer } from "./config/getCondition.js";
import { validateRunner } from "./config/runner.js";
import { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.server.js";

assertReactServer();

/**
 * Main entrypoint for React Server Components.
 *
 * This plugin uses the intelligent orchestrator to adapt its behavior based on the build context:
 * - In Environment API builds: leverages full RSC capabilities
 * - With static pages: adds static generation plugin when appropriate
 *
 * Use this for server-side rendering and static generation with full RSC support.
 * Configure the build target through the strategy parameter.
 * @param options
 * @param strategy
 * @returns
 */
export const vitePluginReactServer: VitePluginMainFn =
  function _vitePluginReactServer(options, strategy?: Strategy) {
    if (options == null) {
      throw new Error("options is required");
    }

    // Runner/condition invariant: a declared runner either matches the
    // process condition or errors here, at config-resolve time.
    validateRunner((options as UserOptions).runner);

    // Use the intelligent orchestrator for plugin composition with server context
    const userStrategy = (options as UserOptions).strategy || {};
    const finalStrategy: Strategy = {
      mode: "auto", // Server builds
      environmentTargets: new Map([["client", "client"], ["ssr", "ssr"], ["server", "server"]]), 
      ...userStrategy,
      ...strategy
    };
    

    return createPluginOrchestrator({
      ...options,
      strategy: finalStrategy
    });
  };

