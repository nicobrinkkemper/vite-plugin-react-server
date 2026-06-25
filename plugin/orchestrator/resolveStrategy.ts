import type { Strategy } from "./types.js";
import { REACT_CONDITION, type ReactCondition } from "../config/getCondition.js";

export interface ResolveStrategyOptions {
  userStrategy?: Partial<Strategy>;
  mainThreadCondition: ReactCondition;
  importContext: ReactCondition;
  functionName: "vitePluginReactClient" | "vitePluginReactServer";
}

/**
 * Resolves and validates the build strategy with sensible defaults
 * 
 * Rules:
 * - If bundleTarget is "server" but mainThreadCondition is "react-client", fail
 * - If bundleTarget is "client" but mainThreadCondition is "react-server", fail
 * - If bundleTarget is not set, set it based on functionName
 * - If mode is not set, default to "auto"
 * - Validate that the strategy is supported
 */
export function resolveStrategy(options: ResolveStrategyOptions): Strategy {
  const { userStrategy = {}, mainThreadCondition, importContext, functionName } = options;

  // Build the strategy with user values and defaults
  const strategy: Strategy = {
    // User strategy overrides
    ...userStrategy,
    
    // Required defaults
    mode: userStrategy.mode || "auto",
    bundleTarget: userStrategy.bundleTarget || (functionName === "vitePluginReactServer" ? "server" : undefined),
    importContext: userStrategy.importContext || importContext,
    mainThreadCondition: userStrategy.mainThreadCondition || mainThreadCondition,
    ssg: userStrategy.ssg !== undefined ? userStrategy.ssg : functionName === "vitePluginReactServer",
    staticBuild: userStrategy.staticBuild !== undefined ? userStrategy.staticBuild : functionName === "vitePluginReactServer"
  };

  // Validate bundleTarget compatibility with mainThreadCondition
  if (strategy.bundleTarget === "server" && mainThreadCondition === REACT_CONDITION.client) {
    throw new Error(
      `Invalid strategy: bundleTarget "server" is not compatible with mainThreadCondition "react-client". ` +
      `Use vitePluginReactServer for server builds or set mainThreadCondition to "react-server".`
    );
  }

  if (strategy.bundleTarget === "client" && mainThreadCondition === REACT_CONDITION.server) {
    throw new Error(
      `Invalid strategy: bundleTarget "client" is not compatible with mainThreadCondition "react-server". ` +
      `Use vitePluginReactServer for client builds or set mainThreadCondition to "react-client".`
    );
  }

  return strategy;
}
