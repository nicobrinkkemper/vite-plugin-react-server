import type { Plugin } from "vite";
import type { StreamPluginOptions, PluginEvent } from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { handleError } from "../error/handleError.js";
import { toError } from "../error/toError.js";
import { addServerManifest } from "../bundle/manifests.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";

// Build event plugin for Environment API builds using resolved user options
export function createBuildEventPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite:plugin-react-server/build-events",
    enforce: "post" as const,
    writeBundle(outputOptions, bundle) {
      console.log("[BuildEventPlugin] writeBundle called with environment:", this.environment?.name, this.environment?.config?.consumer);
      
      // Resolve user options to get proper types and configuration
      const resolvedOptionsResult = resolveOptions(options);
      
      if (resolvedOptionsResult.type === "error") {
        if (
          options.panicThreshold === "all_errors" ||
          options.panicThreshold === "critical_errors"
        ) {
          throw toError(
            resolvedOptionsResult.error ??
              new Error("Failed to resolve options for build event emission")
          );
        } else {
          this.warn(
            `Failed to resolve options for build event emission: ${
              toError(resolvedOptionsResult.error).message
            }`
          );
        }
        return;
      }
      const userOptions = resolvedOptionsResult.userOptions;

      let eventType: PluginEvent["type"] | null = null;

      // Use environment consumer to determine event type (more reliable than name)
      const environmentConsumer = this.environment?.config?.consumer;
      const environmentName = this.environment?.name;
      
      // Check strategy bundleTarget first (highest priority)
      const strategy = (userOptions as any).strategy;
      console.log(`[BuildEventPlugin] strategy:`, strategy);
      console.log(`[BuildEventPlugin] environment: ${environmentName} ${environmentConsumer}`);
      
      // Priority 1: Environment-based naming (most accurate for Environment API builds)
      // Environment API builds have all environments: 'client', 'ssr', 'server'
      // Environment name format is "environment consumer" (e.g., "client client", "ssr client", "server server")
      console.log(`[BuildEventPlugin] === ENVIRONMENT NAME CHECK START ===`);
      console.log(`[BuildEventPlugin] Checking environment name: "${environmentName}"`);
      if (environmentName?.startsWith("client")) {
        console.log(`[BuildEventPlugin] Environment starts with "client", setting eventType to "build.writeBundle.static"`);
        eventType = "build.writeBundle.static";
      } else if (environmentName?.startsWith("ssr")) {
        console.log(`[BuildEventPlugin] Environment starts with "ssr", setting eventType to "build.writeBundle.client"`);
        eventType = "build.writeBundle.client";
      } else if (environmentName?.startsWith("server")) {
        console.log(`[BuildEventPlugin] Environment starts with "server", setting eventType to "build.writeBundle.server"`);
        eventType = "build.writeBundle.server";
      }
      // Priority 2: Strategy bundleTarget (for traditional builds only)
      // Only use strategy bundleTarget if we don't have environment names (traditional builds)
      // In traditional builds, Vite only has 2 environments: 'client' and 'ssr'
      // - bundleTarget: "server" → build.writeBundle.server (server components)
      // - bundleTarget: "ssr" → build.writeBundle.client (SSR client components) 
      // - bundleTarget: "client" → build.writeBundle.static (static client components)
      else if (!environmentName && strategy?.bundleTarget === "server") {
        eventType = "build.writeBundle.server";
      } else if (!environmentName && strategy?.bundleTarget === "ssr") {
        eventType = "build.writeBundle.client";
      } else if (!environmentName && strategy?.bundleTarget === "client") {
        eventType = "build.writeBundle.static";
      } else if (strategy?.ssg === true) {
        eventType = "build.writeBundle.static";
      } 
      // Priority 3: Environment consumer fallback
      else if (environmentConsumer === "client") {
        eventType = "build.writeBundle.static";
      } else if (environmentConsumer === "server") {
        eventType = "build.writeBundle.server";
      } else {
        // default to static build
        eventType = "build.writeBundle.static";
      }
      console.log(`[BuildEventPlugin] === ENVIRONMENT NAME CHECK END ===`);

                   // Store server manifest in global store for SSG plugin access
             if (environmentName?.startsWith("server")) {
               try {
                 const bundleManifest = getBundleManifest({
                   bundle,
                   normalizer: userOptions.normalizer,
                 });
                 // Type assertion since getBundleManifest returns the correct structure
                 addServerManifest(bundleManifest as any);
                 console.log(`[BuildEventPlugin] Stored server manifest in global store with ${Object.keys(bundleManifest).length} entries`);
               } catch (error) {
                 console.warn(`[BuildEventPlugin] Failed to store server manifest:`, error);
               }
             }

      if (eventType && userOptions.onEvent) {
        try {
          const result = userOptions.onEvent({
            type: eventType,
            data: {
              pages: [],
              options: outputOptions,
              bundle,
            },
          });

          // Handle async event callbacks
          if (
            result != null &&
            typeof result === "object" &&
            "then" in result
          ) {
            (result as Promise<any>).catch((error) => {
              const eventPanicError = handleError({
                error,
                panicThreshold: userOptions.panicThreshold,
                context: `onEvent(${eventType})`,
              });
              if (eventPanicError != null) {
                throw eventPanicError; // Re-throw to abort the build
              }
            });
          }
        } catch (error) {
          const eventPanicError = handleError({
            error,
            panicThreshold: userOptions.panicThreshold,
            context: `onEvent(${eventType})`,
          });
          if (eventPanicError != null) {
            throw eventPanicError; // Re-throw to abort the build
          }
        }
      }
    },
  };
}
