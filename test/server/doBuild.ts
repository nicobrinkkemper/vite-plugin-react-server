import { build } from "vite";
import { vitePluginReactClient } from "../../dist/client";
import { vitePluginReactServer } from "../../dist/plugin/plugin.server";
import { PluginEvent, StreamPluginOptions } from "../../plugin/types";
import { testUserOptions } from "../test-config";

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
        console.log('Test Event received:', event.type);
        events.push(event);
        if (optionOverrides?.onEvent) {
          optionOverrides.onEvent(event);
        }
      },
      build: {
        ...testUserOptions.build,
        ...optionOverrides?.build
      },
    };

    // Change to test directory
    let originalCwd = process.cwd();
    process.chdir(options.projectRoot);

    // Do the builds
    await build({
      plugins: [vitePluginReactClient(options)],
      build: {
        ssr: false,
      },
    });

    await build({
      plugins: [vitePluginReactClient(options)],
      build: {
        ssr: true,
      },
    });

    await build({
      plugins: [vitePluginReactServer(options)],
    });
    process.chdir(originalCwd);
    return events;
  }