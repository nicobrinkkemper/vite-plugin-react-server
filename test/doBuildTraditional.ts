import { build } from "vite";
import type {
  PluginEvent,
  StreamPluginOptions,
} from "vite-plugin-react-server/types";
import { testUserOptions } from "./test-config";
import { inspect } from "node:util";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { access, readdir } from "node:fs/promises";

// Plugin imports
import { vitePluginReactClient, vitePluginReactServer } from "vite-plugin-react-server";

/**
 * Builds the project with the test config and given options and returns the events
 * Simulates traditional build behavior using the actual plugins
 * @param optionOverrides - Optional overrides for the options
 * @returns The events from the build
 */
export async function doBuildTraditional(
  optionOverrides: Partial<StreamPluginOptions>
) {
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

  const originalCwd = process.cwd();

  try {
    if (!options.projectRoot) {
      throw new Error("projectRoot is required");
    }

    // Check if index.html exists first
    const indexHtmlPath = resolve(options.projectRoot, "index.html");
    console.log("Looking for index.html at:", indexHtmlPath);
    try {
      await access(indexHtmlPath);
      console.log("✅ index.html found");
    } catch (error) {
      console.log("❌ index.html not found, checking if project root exists...");
      try {
        await access(options.projectRoot);
        console.log("✅ Project root exists");
        const files = await readdir(options.projectRoot);
        console.log("Files in project root:", files);
      } catch (rootError) {
        console.log("❌ Project root doesn't exist");
      }
      throw new Error(
        `index.html not found at ${indexHtmlPath}. Test setup may have been cleaned up by other tests.`
      );
    }

    // Change to project directory
    process.chdir(options.projectRoot);
    console.log("✅ Changed to project directory");

    // Clean output directory
    const distDir = resolve(options.projectRoot, "dist");
    try {
      await rm(distDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, that's fine
    }

    if (process.cwd() !== options.projectRoot) {
      throw new Error(
        `Could not change to project root, Process.cwd() is not the same as the project root, ${process.cwd()} !== ${
          options.projectRoot
        }`
      );
    }

    // Traditional build: Simulate the 3-step build process sequentially
    console.log("🔨 Traditional build using 3-step process");
    
    // Step 1: Static build (client modules for browser)
    console.log("🔨 Step 1: Static build (client modules for browser)");
    const step1Plugins = await vitePluginReactClient({
      ...options,
      strategy: { mode: "auto", bundleTarget: "client" }
    });
    await build({
      plugins: step1Plugins,
      mode: "test",
      root: options.projectRoot,
      build: {
        ssr: false,
      },
    });

    // Step 2: Client build (client boundary modules for SSR)
    console.log("🔨 Step 2: Client build (client boundary modules for SSR)");
    const step2Plugins = await vitePluginReactClient({
      ...options,
      strategy: { mode: "auto", bundleTarget: "ssr" }
    });
    await build({
      plugins: step2Plugins,
      mode: "test",
      root: options.projectRoot,
      build: {
        ssr: true,
      },
    });

    // Step 3: Server build (server boundary modules with react-server condition)
    console.log("🔨 Step 3: Server build (server boundary modules with react-server condition)");
    const step3Plugins = await vitePluginReactClient({
      ...options,
      strategy: { mode: "auto", bundleTarget: "server" }
    });
    await build({
      plugins: step3Plugins,
      mode: "test",
      root: options.projectRoot,
      build: {
        ssr: false,
      },
    });

    process.chdir(originalCwd);
  } catch (error) {
    process.chdir(originalCwd);
    throw error;
  }

  return events;
}
