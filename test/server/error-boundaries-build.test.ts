import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { doBuild } from "../doBuild.js";
import { setupErrorBoundaryTestProject } from "../setup.js";
import { resolve } from "path";
import { rm } from "fs/promises";
import { vitePluginReactServer } from "vite-plugin-react-server";
// client
import { vitePluginReactClient } from "vite-plugin-react-server/client";

import { build } from "vite";
import * as handleErrorModule from "../../dist/plugin/error/handleError.js";
import { testUserOptions } from "../test-config.js";

describe("RSC Build Error Handling", () => {
  let testDir: string = resolve(
    __dirname,
    "../fixtures/error-boundaries-build.test"
  );
  const options = {
    Page: (url: string) => {
      if (url === "/server-error-example") {
        return "src/page/server-error-example/page.tsx";
      }
      if (url === "/client-error-example") {
        return "src/page/client-error-example/page.tsx";
      }
      return "src/page/page.tsx";
    },
    props: (url: string) => {
      if (url === "/server-error-example") {
        return "src/page/server-error-example/props.ts";
      }
      if (url === "/client-error-example") {
        return "src/page/client-error-example/props.ts";
      }
      return "src/page/props.ts";
    },
  };

  beforeAll(async () => {
    // Create test directory in fixtures
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });

    // Setup test project with error boundary components
    await setupErrorBoundaryTestProject(testDir);
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  test('should build successfully with panicThreshold: "none" when page has server errors', async () => {
    const events = await doBuild({
      projectRoot: testDir,
      verbose: true,
      panicThreshold: "none",
      build: {
        pages: ["/", "/server-error-example"],
      },
      ...options,
    });

    // Build should complete successfully even with errors when panicThreshold is none
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);

    // Should have build events
    expect(events.some((e) => e.type === "build.start")).toBe(true);
    expect(events.some((e) => e.type === "file.write.done")).toBe(true);

    // Check that the server-error-example page was built
    const buildStartEvent = events.find((e) => e.type === "build.start");
    expect(buildStartEvent?.data.pages).toContain("/server-error-example");
  });

  test('should build successfully with panicThreshold: "critical_errors" when page has server errors', async () => {
    const events = await doBuild({
      projectRoot: testDir,
      panicThreshold: "critical_errors",
      build: {
        pages: ["/", "/server-error-example"],
      },
      ...options,
    });

    // Build should complete successfully even with errors when panicThreshold is critical_errors
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);

    // Should have build events
    expect(events.some((e) => e.type === "build.start")).toBe(true);
    expect(events.some((e) => e.type === "file.write.done")).toBe(true);

    // Check that the server-error-example page was built
    const buildStartEvent = events.find((e) => e.type === "build.start");
    expect(buildStartEvent?.data.pages).toContain("/server-error-example");
  });

  test('should fail to build with panicThreshold: "all_errors" when page has server errors', async () => {
    // The build should fail during the build process when panicThreshold is "all_errors"
    // and there are server errors in the pages being built

    const buildOptions = {
      ...testUserOptions,
      projectRoot: testDir,
      moduleBase: "src",
      panicThreshold: "all_errors" as const,
      build: {
        pages: ["/", "/server-error-example"],
      },
    };
    // cd to testDir
    let cwd = process.cwd();
    process.chdir(testDir);

    // Copy the doBuild logic inline to handle errors properly
    const events: any[] = [];
    const options = {
      ...buildOptions,
      onEvent: (event: any) => {
        console.log("Test Event:", event.type);
        events.push(event);
      },
    };

    // Clean output directory
    const distDir = resolve(testDir, "dist");
    await rm(distDir, { recursive: true, force: true });

    // Do the builds - client first (should succeed)
    await build({
      mode: "test",
      plugins: [vitePluginReactClient(options)],
      build: { ssr: false },
    });

    // Client SSR build (should succeed)
    await build({
      mode: "test",
      plugins: [vitePluginReactClient(options)],
      build: { ssr: true },
    });

    // Server build (generates manifest and includes static plugin) - should fail
    await expect(
      build({
        mode: "test",
        plugins: [vitePluginReactServer(options)],
        build: { ssr: true },
      })
    ).rejects.toThrow();

    // Restore cwd
    process.chdir(cwd);
  });
});
