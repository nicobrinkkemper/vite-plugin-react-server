import type { VitePluginMainAsyncFn } from "./types.js";
import type { UserOptions, Strategy } from "./orchestrator/createPluginOrchestrator.js";

import { assertReactServer } from "./config/getCondition.js";
import { createPluginOrchestrator } from "./orchestrator/createPluginOrchestrator.js";

assertReactServer();

/**
 * Main entrypoint for React Server Components in server environment.
 *
 * This plugin uses the intelligent orchestrator to adapt its behavior based on the build context:
 * - In traditional builds: uses auto-detection to determine capabilities
 * - In environment API builds: leverages full RSC capabilities
 * - With static pages: adds static generation plugin when appropriate
 *
 * Use this for server-side rendering and static generation with full RSC support.
 * @param options
 * @returns
 */
export const vitePluginReactServer: VitePluginMainAsyncFn =
  async function _vitePluginReactServer(options) {
    if (options == null) {
      throw new Error("options is required");
    }

    // Use the intelligent orchestrator for plugin composition with server context
    const userStrategy = (options as UserOptions).strategy || {};
    const strategy: Strategy = {
      mode: "auto", // Let orchestrator decide based on context
      importContext: "react-server", // Indicate this came from server context
      bundleTarget: "server", // Indicate which function was called
      staticBuild: true, // Server function includes static build step
      ssg: true, // Server builds should enable SSG by default
      ...userStrategy
    };
    

    console.log(`[Plugin Server] Strategy for vitePluginReactServer:`, strategy);
    return createPluginOrchestrator({
      ...options,
      strategy
    });
  };

/**
 * Vite plugin for the React client, use specific name to support static import (that doesn't conflict with vitePluginReactServer)
 * Uses the intelligent orchestrator for plugin composition with client context.
 * @param options
 * @returns
 */
export const vitePluginReactClient: VitePluginMainAsyncFn =
  async function _vitePluginReactClient(options) {
    if (options == null) {
      throw new Error("options is required");
    }

    console.log(`[Plugin Server] vitePluginReactClient called with options:`, options);
    
    // Use the intelligent orchestrator for plugin composition with client context
    const userStrategy = (options as UserOptions).strategy || {};
    const strategy: Strategy = {
      mode: "auto", // Let orchestrator decide based on context
      importContext: "react-server", // Indicate this came from server context
      bundleTarget: "client", // Indicate which function was called
      ...userStrategy
    };
    

    
    console.log(`[Plugin Server] Strategy for vitePluginReactClient:`, strategy);
    return createPluginOrchestrator({
      ...options,
      strategy
    });
  };