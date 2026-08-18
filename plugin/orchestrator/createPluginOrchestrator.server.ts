import type { Plugin } from "vite";
import { vitePluginReactDevServer } from "../dev-server/plugin.server.js";
import { reactStaticPlugin } from "../react-static/plugin.server.js";
import {
  createPluginOrchestratorImpl,
  type OrchestratorStrategy,
} from "./createPluginOrchestrator.impl.js";
import type { ReactCondition } from "../config/getCondition.js";

// The `main` runner record: react-server executes on the main thread, so this
// face pulls the .server dev-server / react-static plugins and runs the
// transformer with a "server" default environment. It lives in the .server
// tree because its imports only initialize under the process condition — the
// runner/condition invariant (plugin/config/runner.ts) guarantees a declared
// `main` runner and this tree coincide. The shared body lives in
// createPluginOrchestrator.impl.ts.
const mainRunner: OrchestratorStrategy = {
  defaultEnvironment: "server",
  devServerPlugin: vitePluginReactDevServer,
  staticPlugin: reactStaticPlugin,
};

export const createPluginOrchestrator = (userOptions: any): Plugin[] =>
  createPluginOrchestratorImpl(userOptions, mainRunner);


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
