import type { Plugin } from "vite";
import { vitePluginReactDevServer } from "../dev-server/plugin.client.js";
import { reactStaticPlugin } from "../react-static/plugin.client.js";
import {
  createPluginOrchestratorImpl,
  type OrchestratorStrategy,
} from "./createPluginOrchestrator.impl.js";
import type { ReactCondition } from "../config/getCondition.js";

// The `isolated` runner record: the worker_threads rsc-worker owns
// react-server resolution, so the main thread stays client-first — this face
// pulls the .client dev-server / react-static plugins and runs the
// transformer with a "client" default environment. It lives in the .client
// tree because its imports only initialize without the process condition —
// the runner/condition invariant (plugin/config/runner.ts) guarantees a
// declared `isolated` runner and this tree coincide. The shared body lives in
// createPluginOrchestrator.impl.ts.
const isolatedRunner: OrchestratorStrategy = {
  defaultEnvironment: "client",
  devServerPlugin: vitePluginReactDevServer,
  staticPlugin: reactStaticPlugin,
};

export const createPluginOrchestrator = (userOptions: any): Plugin[] =>
  createPluginOrchestratorImpl(userOptions, isolatedRunner);


export interface Strategy {
  mode?: "auto" | "server" | "client";
  bundleTarget?: "server" | "client" | "ssr";
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
