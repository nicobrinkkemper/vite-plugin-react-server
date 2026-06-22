import type { Plugin } from "vite";
import { vitePluginReactDevServer } from "../dev-server/plugin.server.js";
import { reactStaticPlugin } from "../react-static/plugin.server.js";
import { createPluginOrchestratorImpl } from "./createPluginOrchestrator.impl.js";

// Server-first orchestrator — pulls the .server dev-server / react-static plugins
// and runs the transformer with a "server" default environment. The shared body
// lives in createPluginOrchestrator.impl.ts.
export const createPluginOrchestrator = (userOptions: any): Plugin[] =>
  createPluginOrchestratorImpl(userOptions, {
    defaultEnvironment: "server",
    devServerPlugin: vitePluginReactDevServer,
    staticPlugin: reactStaticPlugin,
  });


export interface Strategy {
  mode?: "auto" | "server" | "client";
  bundleTarget?: "server" | "client" | "ssr";
  importContext?: "react-server" | "react-client";
  mainThreadCondition?: "react-server" | "react-client";
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
