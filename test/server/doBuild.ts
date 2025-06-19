import { build } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { PluginEvent, StreamPluginOptions, PagePropOpt, InlineCssOpt } from "vite-plugin-react-server/types";
import { testUserOptions } from "../test-config";
import { inspect } from "node:util";
import { rm } from "fs/promises";
import { resolve } from "path";

/**
 * Builds the project with the test config and given options and returns the events
 * Handles changing to the test directory and restoring the original working directory
 * @param optionOverrides - Optional overrides for the options
 * @returns The events from the build
 */
export async function doBuild<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  N1 extends string = "Page",
  N2 extends string = "props"
>(optionOverrides: Partial<StreamPluginOptions<T, InlineCSS, 'div', N1, N2>>) {
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
      events.push(event);
      if (optionOverrides?.onEvent) {
        optionOverrides.onEvent(event);
      }
    },
    build: {
      ...testUserOptions.build,
      ...optionOverrides?.build,
    },
  } as StreamPluginOptions<T, InlineCSS>;

  // Change to test directory
  let originalCwd = process.cwd();
  process.chdir(options.projectRoot ?? "");

  // Clean output directory only at the start
  const distDir = resolve(options.projectRoot ?? "", "dist");
  await rm(distDir, { recursive: true, force: true });

  // Do the builds
  await build({  
    mode: "test",
    plugins: [vitePluginReactClient(options)],
    build: {
      ssr: false,
    },
  });

  await build({
    mode: "test",
    plugins: [vitePluginReactClient(options)],
    build: {
      ssr: true,
    },
  });

  await build({
    mode: "test",
    plugins: [vitePluginReactServer(options)],
  });

  process.chdir(originalCwd);
  return events ?? [];
}
