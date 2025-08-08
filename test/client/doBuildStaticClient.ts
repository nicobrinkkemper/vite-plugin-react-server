import { build } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import type {
  PluginEvent,
  StreamPluginOptions,
} from "vite-plugin-react-server/types";
import { testUserOptions } from "../test-config";
import { inspect } from "node:util";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Builds the project with the client static plugin for testing
 * This simulates the --app mode where client static plugin is used
 * @param optionOverrides - Optional overrides for the options
 * @returns The events from the build
 */
export async function doBuildStaticClient(optionOverrides: Partial<StreamPluginOptions>) {
  const events: PluginEvent[] = [];
  
  const options = {
    ...testUserOptions,
    ...optionOverrides,
    onEvent: (event: PluginEvent) => {
      console.log(
        "Test Event:",
        inspect(event.type, { colors: true, depth: 0 })
      );
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

  // Change to test directory
  const originalCwd = process.cwd();
  process.chdir(options.projectRoot ?? "");

  // Clean output directory
  const distDir = resolve(options.projectRoot ?? "", "dist");
  await rm(distDir, { recursive: true, force: true });
  const prevNodeOptions = process.env.NODE_OPTIONS;

  // Do the builds with client static plugin
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
  
  // Use the server plugin for static generation (runs in react-server condition when using 'npm run test')
  console.log('[DEBUG] Starting static generation build...');
  await build({
    plugins: [vitePluginReactServer(options)],
    // No ssr: true here - this allows static generation to run properly
  });
  console.log('[DEBUG] Static generation build completed!');

  process.env.NODE_OPTIONS = prevNodeOptions;
  process.chdir(originalCwd);
  console.log('[DEBUG] doBuildStaticClient completed, returning events');
  return events;
} 