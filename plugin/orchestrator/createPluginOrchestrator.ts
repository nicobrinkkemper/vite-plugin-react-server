import type { Plugin } from "vite";
import type { StreamPluginOptions } from "../types.js";
import { pluginRoot } from "../root.js";
import { getCondition } from "../config/getCondition.js";

// Strategy types
export interface Strategy {
  mode: "auto" | "server" | "client";
  importContext?: "react-server" | "react-client"; // Which file the plugin was imported from
  mainThreadCondition?: "react-server" | "react-client"; // Current runtime condition (auto-detected)
  staticBuild?: boolean;
  bundleTarget?: "client" | "ssr" | "server" | "all" | "client-ssr";
  ssg?: boolean;
  forceCapabilities?: {
    staticGeneration?: boolean;
    serverComponents?: boolean;
  };
}

// Extend StreamPluginOptions to include strategy
export interface UserOptions extends StreamPluginOptions {
  strategy?: Strategy;
  availableEnvironments?: string[];
}

interface OrchestrationResult {
  mainThreadCondition: "react-server" | "react-client";
  availableEnvironments: string[];
  capabilities: {
    staticGeneration: boolean;
    serverComponents: boolean;
    clientBuilds: boolean;
    ssrBuilds: boolean;
  };
  plugins: Plugin[];
}

const getMainThreadCondition = (
  strategy: Strategy,
  config: any
): "react-server" | "react-client" => {
  // If user explicitly specified runtime condition, use it
  if (strategy.mainThreadCondition) {
    return strategy.mainThreadCondition;
  }

  // Auto-detection from NODE_OPTIONS and Vite config
  const currentCondition = getCondition();
  const externalConditions = config.resolve?.externalConditions || [];

  // Debug logging
  console.log(`[Orchestrator Debug] NODE_OPTIONS: ${process.env.NODE_OPTIONS}`);
  console.log(
    `[Orchestrator Debug] getCondition() returned: ${currentCondition}`
  );
  console.log(
    `[Orchestrator Debug] externalConditions: ${JSON.stringify(
      externalConditions
    )}`
  );

  switch (strategy.mode) {
    case "server":
      // Must have react-server condition
      if (
        currentCondition !== "react-server" &&
        !externalConditions.includes("react-server")
      ) {
        throw new Error(
          "server mode requires react-server condition"
        );
      }
      return "react-server";

    case "client":
      // Must NOT have react-server condition
      if (
        currentCondition === "react-server" ||
        externalConditions.includes("react-server")
      ) {
        throw new Error(
          "client mode cannot have react-server condition"
        );
      }
      return "react-client";

    case "auto":
    default:
      // Auto-detect based on NODE_OPTIONS first, then Vite config
      if (
        currentCondition === "react-server" ||
        externalConditions.includes("react-server")
      ) {
        return "react-server";
      }
      return "react-client";
  }
};

const getAvailableEnvironments = (
  condition: "react-server" | "react-client",
  useLegacyBuilder: boolean,
  config?: any,
  staticBuild?: boolean,
  bundleTarget?: string
): string[] => {
  if (useLegacyBuilder) {
    // Traditional build: use bundleTarget or staticBuild option if provided, otherwise fall back to config
    if (bundleTarget) {
      switch (bundleTarget) {
        case "client":
          return ["client"];
        case "ssr":
          return ["ssr"];
        case "server":
          return ["server"];
        case "client-ssr":
          return ["client", "ssr"];
        case "all":
          return ["client", "ssr", "server"];
        default:
          break;
      }
    }
    if (staticBuild !== undefined) {
      return staticBuild ? ["client"] : ["ssr"];
    }
    // Fall back to config-based detection
    const isSsrBuild = config?.build?.ssr !== false; // undefined or true = ssr
    return isSsrBuild ? ["ssr"] : ["client"];
  } else {
    // Environment API: use condition to determine available environments
    if (bundleTarget) {
      switch (bundleTarget) {
        case "client":
          return ["client"];
        case "ssr":
          return ["ssr"];
        case "server":
          // For server bundleTarget, include all environments needed for full functionality
          return ["client", "ssr", "server"];
        case "client-ssr":
          return ["client", "ssr"];
        case "all":
          return ["client", "ssr", "server"];
        default:
          break;
      }
    }
    // For Environment API builds, condition determines which environments are available
    if (condition === "react-server") {
      return ["client", "ssr", "server"];
    } else {
      return ["client", "ssr"];
    }
  }
};

const getCapabilities = (
  condition: "react-server" | "react-client",
  availableEnvironments: string[],
  strategy?: Strategy
) => {
  // In Environment API mode, we have all environments available, so we can do SSG
  // For traditional builds, only react-server condition can do SSG by default
  const hasAllEnvironments = availableEnvironments.includes("client") && 
                            availableEnvironments.includes("ssr") && 
                            availableEnvironments.includes("server");
  
  return {
    staticGeneration: condition === "react-server" || strategy?.ssg === true || hasAllEnvironments,
    serverComponents: condition === "react-server",
    clientBuilds: true,
    ssrBuilds: availableEnvironments.includes("ssr"),
  };
};

const applyStrategyOverrides = async (
  orchestration: OrchestrationResult,
  strategy: Strategy
): Promise<OrchestrationResult> => {
  if (!strategy.forceCapabilities) {
    return orchestration;
  }

  // Override capabilities based on strategy
  const capabilities = {
    ...orchestration.capabilities,
    ...strategy.forceCapabilities,
  };

  // Re-compose plugins with forced capabilities
  const plugins = await composePlugins(
    orchestration.mainThreadCondition,
    orchestration.plugins[0]?.options || {}, // Extract userOptions from first plugin
    capabilities,
    orchestration.availableEnvironments,
    orchestration.plugins[0]?.options || {} // Pass original userOptions with strategy
  );

  return {
    ...orchestration,
    capabilities,
    plugins,
  };
};

const composePlugins = async (
  condition: "react-server" | "react-client",
  userOptions: any,
  capabilities: any,
  availableEnvironments: string[],
  originalUserOptions: any // Original userOptions with strategy
): Promise<Plugin[]> => {
  const plugins: Plugin[] = [];

  // Import plugins dynamically to avoid circular dependencies
  const { createEnvironmentPlugin } = await import(
    `${pluginRoot}/environments/createEnvironmentPlugin.js`
  );
  const { createBuildEventPlugin } = await import(
    `${pluginRoot}/environments/createBuildEventPlugin.js`
  );
  const { createTransformerPlugin } = await import(
    `${pluginRoot}/transformer/createTransformerPlugin.js`
  );

  // Core plugins
  plugins.push(createEnvironmentPlugin({
    ...userOptions,
    availableEnvironments, // Pass available environments to environment plugin
  }));
  plugins.push(createBuildEventPlugin(originalUserOptions));

  // Dev server plugin - always add, let the plugin handle environment detection
  const staticCondition = condition === "react-server" ? "server" : "client";
  console.log(`[Plugin Orchestrator] Adding dev server plugin for condition: ${condition}, staticCondition: ${staticCondition}`);
  const { vitePluginReactDevServer } = await import(
    `${pluginRoot}/dev-server/plugin.${staticCondition}.js`
  );
  plugins.push(vitePluginReactDevServer(userOptions));

  // Condition-specific transformers
  if (condition === "react-client") {
    plugins.push(
      createTransformerPlugin({
        name: "client",
        allowedEnvironments: ["client", "ssr"],
      })(userOptions)
    );
  }

  if (condition === "react-server") {
    plugins.push(
      createTransformerPlugin({
        name: "server",
        allowedEnvironments: ["server"],
      })(userOptions)
    );
  }

  // Static generation - add SSG plugin for both traditional and Environment API builds
  console.log(`[Plugin Orchestrator] capabilities.staticGeneration: ${capabilities.staticGeneration}`);
  if (capabilities.staticGeneration) {
    const useLegacyBuilder = originalUserOptions.useLegacyBuilder;
    
    if (useLegacyBuilder) {
      // Traditional builds - add SSG plugin to the appropriate environment
      const staticCondition = condition === "react-server" ? "server" : "client";
      console.log(`[Plugin Orchestrator] Traditional build - Including SSG plugin for condition: ${condition}, staticCondition: ${staticCondition}`);
      const { reactStaticPlugin } = await import(
        `${pluginRoot}/react-static/plugin.${staticCondition}.js`
      );
      plugins.push(reactStaticPlugin(userOptions));
    } else {
      // Environment API builds - add SSG plugin based on condition
      // The plugin will only run in the appropriate environment due to applyToEnvironment
      const staticCondition = condition === "react-server" ? "server" : "client";
      console.log(`[Plugin Orchestrator] Environment API build - Including SSG plugin for condition: ${condition}, staticCondition: ${staticCondition}`);
      const { reactStaticPlugin } = await import(
        `${pluginRoot}/react-static/plugin.${staticCondition}.js`
      );
      plugins.push(reactStaticPlugin(userOptions));
    }
  } else {
    console.log(`[Plugin Orchestrator] Skipping SSG plugin - capabilities.staticGeneration is false`);
  }

  return plugins;
};

interface OrchestrationParams {
  userOptions: UserOptions;
  config: any;
  env: any;
  useLegacyBuilder: boolean;
}

const determineOrchestration = async ({
  userOptions,
  config,
  env,
  useLegacyBuilder,
}: OrchestrationParams): Promise<OrchestrationResult> => {
  // Get strategy from userOptions or use defaults based on semantic context
  const userStrategy = userOptions.strategy || {};
  
  // Determine semantic context based on which plugin function was called
  const isServerPlugin = (userStrategy as Strategy).mode === "server";
  
  // Set intelligent defaults based on semantic context
  // Only apply semantic defaults for traditional builds (useLegacyBuilder: true)
  // For Environment API builds, let the Environment API handle environment selection
  const strategy: Strategy = {
    mode: "auto",
    ...(useLegacyBuilder && isServerPlugin && { bundleTarget: "server" }),
    ...userStrategy
  };

  // Extract strategy without modifying userOptions
  const cleanUserOptions = { ...userOptions };
  delete cleanUserOptions.strategy; // Remove strategy from options passed to other plugins

  // 1. Determine main thread condition based on strategy
  // Use importContext if provided (indicates which file the plugin was imported from)
  // Otherwise fall back to auto-detection
  const mainThreadCondition = strategy.importContext || getMainThreadCondition(strategy, config);

  // 2. Determine if this is environment API or traditional build
  console.log(`[Plugin Orchestrator] useLegacyBuilder: ${useLegacyBuilder}`);
  console.log(`[Plugin Orchestrator] env:`, env);
  console.log(`[Plugin Orchestrator] strategy.staticBuild: ${strategy.staticBuild}`);

  // 3. Determine available environments based on condition and strategy options
  const availableEnvironments = getAvailableEnvironments(
    mainThreadCondition,
    useLegacyBuilder,
    config,
    strategy.staticBuild,
    strategy.bundleTarget
  );

  // 4. Determine capabilities based on condition and strategy
  const capabilities = getCapabilities(
    mainThreadCondition,
    availableEnvironments,
    strategy
  );

  // 5. Compose plugins based on condition and capabilities
  const plugins = await composePlugins(
    mainThreadCondition,
    cleanUserOptions,
    capabilities,
    availableEnvironments,
    userOptions // Pass original userOptions with strategy for build event plugin
  );

  // 6. Apply strategy-specific overrides and SSR configuration
  const orchestration: OrchestrationResult = {
    mainThreadCondition,
    availableEnvironments,
    capabilities,
    plugins,
  };

  // Auto-configure SSR based on main thread condition
  if (mainThreadCondition === "react-server" && useLegacyBuilder) {
    // For react-server condition in traditional builds, automatically set build.ssr to true
    // unless explicitly disabled at top level config
    if (config?.build?.ssr !== false) {
      console.log(`[Plugin Orchestrator] Auto-setting build.ssr to true for react-server condition`);
      // Note: This would need to be applied to the actual Vite config, not just the orchestration
      // For now, we'll log it and let the environment detection handle it
    }
  }

  return await applyStrategyOverrides(orchestration, strategy);
};

export const createPluginOrchestrator = async (
  userOptions: UserOptions,
  env?: any
): Promise<Plugin[]> => {
  // Determine orchestration based on context
  const orchestration = await determineOrchestration({
    userOptions,
    config: {},
    env: env || { command: "build", mode: "production" },
    useLegacyBuilder: false, // Assume Environment API build by default
  });
  
  console.log(`[Plugin Orchestrator] Orchestration:`, {
    mainThreadCondition: orchestration.mainThreadCondition,
    availableEnvironments: orchestration.availableEnvironments,
    capabilities: orchestration.capabilities,
    pluginCount: orchestration.plugins.length
  });
  
  console.log(`[Plugin Orchestrator] Returning ${orchestration.plugins.length} plugins:`, 
    orchestration.plugins.map(p => p.name));
  
  return orchestration.plugins;
};
