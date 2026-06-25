import type { Plugin } from "vite";
import { vitePluginReactDevServer } from "../dev-server/plugin.client.js";
import { reactStaticPlugin } from "../react-static/plugin.client.js";
import { createPluginOrchestratorImpl } from "./createPluginOrchestrator.impl.js";
import type { ReactCondition } from "../config/getCondition.js";

// Client-first orchestrator — pulls the .client dev-server / react-static plugins
// and runs the transformer with a "client" default environment. The shared body
// lives in createPluginOrchestrator.impl.ts.
export const createPluginOrchestrator = (userOptions: any): Plugin[] =>
  createPluginOrchestratorImpl(userOptions, {
    defaultEnvironment: "client",
    devServerPlugin: vitePluginReactDevServer,
    staticPlugin: reactStaticPlugin,
  });


export interface Strategy {
  mode?: "auto" | "server" | "client";
  bundleTarget?: "server" | "client" | "ssr";
  importContext?: ReactCondition;
  mainThreadCondition?: ReactCondition;
  legacyBuilder?: boolean;
  staticBuild?: boolean;
  ssg?: boolean;
  forceCapabilities?: {
    staticGeneration?: boolean;
    serverComponents?: boolean;
    clientBuilds?: boolean;
    ssrBuilds?: boolean;
  };
}
