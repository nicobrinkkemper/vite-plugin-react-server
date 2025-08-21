import type { Plugin } from "vite";
import { getCondition } from "../config/getCondition.js";

// Helper exports used by transformers
export function getEnvironmentName(plugin: any): string | undefined {
  if (plugin?.environment?.name) return plugin.environment.name;
  if (plugin?.config && (plugin.config as any).environment?.name) {
    return (plugin.config as any).environment.name;
  }
  const traditionalModeConfig = (globalThis as any)
    .__vitePluginReactServerTraditionalModeConfig;
  if (traditionalModeConfig?.isTraditionalMode) {
    return traditionalModeConfig.environmentName as string;
  }
  return undefined;
}

export function validateEnvironmentName(
  environmentName: string,
  allowedEnvironments: string[]
): boolean {
  return allowedEnvironments.includes(environmentName);
}


// Helper function to ensure config resolution in the correct condition
export function ensureConditionalConfigResolution(environmentName: string) {
  const appModeConfig = (globalThis as any)
    .__vitePluginReactServerAppModeConfig;

  if (appModeConfig && appModeConfig.isAppMode) {
    // In --app mode, ensure we're resolving in the correct condition
    const condition =
      environmentName === "server" ? "react-server" : "react-client";

    if (!appModeConfig.resolvedInConditions.has(condition)) {
      console.log(
        `🔧 Ensuring config resolution in ${condition} condition for ${environmentName} environment`
      );
      appModeConfig.resolvedInConditions.add(condition);

      // This could trigger additional config resolution if needed
      return true;
    } else {
      console.log(
        `✅ Config already resolved in ${condition} condition for ${environmentName} environment`
      );
      return false;
    }
  }

  return false;
}

const dir = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
const condition = getCondition("");

export const { envPlugin } = (await import(`${dir}/plugin.${condition}.js`)) as {
  envPlugin: () => Plugin;
};