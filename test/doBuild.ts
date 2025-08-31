import { createBuilder } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import type {
  PluginEvent,
  StreamPluginOptions,
} from "vite-plugin-react-server/types";
import { testUserOptions } from "./test-config";
import { inspect } from "node:util";

/**
 * Builds the project with the test config and given options and returns the events
 * Handles changing to the test directory and restoring the original working directory
 * @param optionOverrides - Optional overrides for the options
 * @returns The events from the build
 */
export async function doBuild(optionOverrides: Partial<StreamPluginOptions>) {
  const events: PluginEvent[] = [];
  // check directory
  const options = {
    ...testUserOptions,
    ...optionOverrides,
    onEvent: (event: PluginEvent) => {
      console.log(
        "Test Event:",
        inspect(event.type, { colors: true, depth: 0 })
      );
      if (event.type === "route.error") {
        console.trace("Tests error for route", event.data.route, event.data.error);
      }
      events.push(event);
      if (optionOverrides?.onEvent) {
        optionOverrides.onEvent(event);
      }
    },
    build: {
      ...testUserOptions.build,
      ...optionOverrides?.build,
    },
  } as StreamPluginOptions;

  // Do the builds
  const originalCwd = process.cwd();
  try {
    // Change to test directory
    process.chdir(options.projectRoot ?? "");

    // Use the Environment API with createBuilder to get full control
    // The environment configuration is now handled by the createEnvironmentPlugin
    const builder = await createBuilder({
      plugins: [vitePluginReactServer(options)],
      mode: "test",
      root: options.projectRoot,
    });

    // Manually call buildApp() to build all environments
    // Debug logging removed for performance
    await builder.buildApp();
    process.chdir(originalCwd);
  } catch (error) {
    process.chdir(originalCwd);
    throw error;
  }

  return events;
}
