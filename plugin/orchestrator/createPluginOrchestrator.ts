import type { Plugin } from "vite";
import { getCondition } from "../config/getCondition.js";
import type { UserOptions } from "./types.js";

// Strategy types
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

const condition = getCondition();
const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

export const { createPluginOrchestrator } = (await import(
  `${dirname}/createPluginOrchestrator.${condition === "react-server" ? "server" : "client"}.js`
)) as {
  createPluginOrchestrator: (userOptions: UserOptions) => Plugin[];
};