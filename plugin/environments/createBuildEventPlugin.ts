import type { Plugin } from "vite";
import type { StreamPluginOptions, PluginEvent } from "../types.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { handleError } from "../error/handleError.js";
import { toError } from "../error/toError.js";

// Build event plugin for Environment API builds using resolved user options
export function createBuildEventPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite:plugin-react-server/build-events",
    enforce: "post" as const,
    applyToEnvironment(env) {
      // Apply to all environments in Environment API builds
      const envName = (env?.name || "").toLowerCase();
      if (envName === "client" || envName === "ssr" || envName === "server") {
        return true;
      }
      return false;
    },
    writeBundle(outputOptions, bundle) {
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

      // Use environment name to determine event type
      const environmentName = this.environment?.name;

      if (environmentName === "client") {
        eventType = "build.writeBundle.static";
      } else if (environmentName === "ssr") {
        eventType = "build.writeBundle.client";
      } else if (environmentName === "server") {
        eventType = "build.writeBundle.server";
      } else {
        // default to static build
        eventType = "build.writeBundle.static";
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
