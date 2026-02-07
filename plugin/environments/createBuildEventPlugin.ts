import type { Plugin } from "vite";
import type { StreamPluginOptions, PluginEventType } from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import {
  addServerManifest,
  updateSharedManifest,
  signalServerManifestReady,
} from "../bundle/manifests.js";
import { handleError } from "../error/handleError.js";

export function createBuildEventPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite:plugin-react-server:build-events",
    enforce: "post",
    apply: "build",

    writeBundle(outputOptions, bundle) {
      const resolvedOptionsResult = resolveOptions(options);
      if (resolvedOptionsResult.type === "error") {
        
        return;
      }
      const userOptions = resolvedOptionsResult.userOptions;

      const environmentName = this.environment?.name;


      // Determine event type based on environment name
      let eventType: PluginEventType | undefined;


      if (environmentName?.startsWith("client")) {
        eventType = "build.writeBundle.client";

      } else if (environmentName?.startsWith("ssr")) {
        eventType = "build.writeBundle.static";
      } else if (environmentName?.startsWith("server")) {
        eventType = "build.writeBundle.server";
      }

      // Store server manifest in global store for SSG plugin access
      if (environmentName?.startsWith("server")) {
        try {
          const bundleManifest = getBundleManifest({
            bundle,
            normalizer: userOptions.normalizer,
          });
          // Type assertion since getBundleManifest returns the correct structure
          addServerManifest(bundleManifest as any);

          // Also update the shared state between environments
          updateSharedManifest(this, "server", bundleManifest as any);
          
          // Signal that server manifest is ready for waiting consumers
          signalServerManifestReady(bundleManifest as any);

        } catch (error) {
          const eventPanicError = handleError({
            error,
            panicThreshold: userOptions.panicThreshold,
            context: `writeBundle(server manifest)`,
          });
          if (eventPanicError != null) {
            this.error(eventPanicError); // Re-throw to abort the build
          } else {
            this.warn(error as any);
          }
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
          } as any); // Type assertion to avoid complex type checking

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
            this.error(eventPanicError); // Log the error
            throw eventPanicError; // Re-throw to abort the build
          } else {
            this.warn(error as any);
            // For non-panic errors, don't throw - just warn
          }
        }
      }
    },
  };
}
