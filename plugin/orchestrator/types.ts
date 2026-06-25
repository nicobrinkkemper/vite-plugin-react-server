import type { StreamPluginOptions } from "../types.js";
import type { ReactCondition } from "../config/getCondition.js";

// Strategy types
export interface Strategy {
    mode?: "auto" | "client" | "server";
    bundleTarget?: "server" | "client" | "ssr";
    importContext?: ReactCondition;
    mainThreadCondition?: ReactCondition;
    staticBuild?: boolean;
    ssg?: boolean;
    environmentTargets?: Map<string, string>;
    forceCapabilities?: {
      staticGeneration?: boolean;
      serverComponents?: boolean;
      clientBuilds?: boolean;
      ssrBuilds?: boolean;
    };
  }

// Extend StreamPluginOptions to include strategy
export interface UserOptions extends StreamPluginOptions {
  strategy?: Strategy;
  availableEnvironments?: string[];
}
