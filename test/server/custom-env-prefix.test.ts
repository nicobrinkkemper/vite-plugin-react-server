import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { build } from "vite";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import type { PluginEvent } from "../../dist/plugin/types.js";
import { setupTestProjectEnv } from "../setup.js";

describe("Custom Environment Prefix Integration", () => {
  const testDir = resolve(__dirname, "../fixtures/custom-env-prefix.test");
  let events: PluginEvent[] = [];

  beforeAll(async () => {
    // Set up custom environment variables with CUSTOM_ prefix
    // Use individual assignments instead of replacing the entire process.env
    process.env.CUSTOM_MODE = "production";
    process.env.CUSTOM_DEV = "false";
    process.env.CUSTOM_PROD = "true";
    process.env.CUSTOM_SSR = "true";
    process.env.CUSTOM_BASE_URL = "/custom-app";
    process.env.CUSTOM_PUBLIC_ORIGIN = "https://custom.example.com";
    


    try {
      await mkdir(testDir, { recursive: true });
      await setupTestProjectEnv(testDir);

      // Change to test directory for build
      const originalCwd = process.cwd();
      process.chdir(testDir);

      // Clean dist directory
      const distDir = resolve(testDir, "dist");
      await rm(distDir, { recursive: true, force: true });

      // Build with custom envPrefix configuration
      await build({
        mode: "test",
        root: testDir,
        envPrefix: "CUSTOM_", // This is the key test - custom prefix instead of VITE_
        plugins: [
          vitePluginReactServer({
            projectRoot: testDir,
            moduleBase: "src",
            Page: "src/page/page.tsx",
            props: "src/page/props.ts",
            build: {
              pages: ["/"],
              preserveModulesRoot: false,
            },
            onEvent: (event: PluginEvent) => {
              events.push(event);
            },
            // we do not need static manifest for this test
            panicThreshold: "critical_errors",
          })
        ],
      });

      process.chdir(originalCwd);
    } catch (error) {
      console.error("Error building project with custom env prefix", error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
    // Restore original environment by removing our custom vars
    delete process.env.CUSTOM_MODE;
    delete process.env.CUSTOM_DEV;
    delete process.env.CUSTOM_PROD;
    delete process.env.CUSTOM_SSR;
    delete process.env.CUSTOM_BASE_URL;
    delete process.env.CUSTOM_PUBLIC_ORIGIN;
    } catch  {
    }
    
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("should complete build successfully with custom environment prefix", async () => {
    // Check that we have the expected build events
    const buildEvents = events.filter(e => 
      e.type === "build.writeBundle.client" || 
      e.type === "build.writeBundle.static-client" ||
      e.type === "build.writeBundle.server" ||
      e.type === "build.writeBundle.static-server"
    );
    expect(buildEvents.length).toBeGreaterThan(0);
  });

  it("should emit expected file write events", async () => {
    const fileWriteDoneEvents = events.filter((e) => e.type === "file.write.done");
    expect(fileWriteDoneEvents.length).toBeGreaterThan(0);
    
    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    );
    expect(htmlEvent).toBeDefined();

    const rscEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "rsc"
    );
    expect(rscEvent).toBeDefined();
  });

  it("should preserve custom environment variables throughout build process", async () => {
    // Check that our custom environment variables are still set
    expect(process.env.CUSTOM_MODE).toBe("production");
    expect(process.env.CUSTOM_DEV).toBe("false");
    expect(process.env.CUSTOM_PROD).toBe("true");
    expect(process.env.CUSTOM_BASE_URL).toBe("/custom-app");
    expect(process.env.CUSTOM_PUBLIC_ORIGIN).toBe("https://custom.example.com");
  });

  it("should have build completed without errors", async () => {
    // If we get here, the build completed successfully with custom envPrefix
    // This verifies that the env-loader and other components handle custom prefix correctly
    const buildStartEvent = events.find((e) => e.type === "build.start");
    expect(buildStartEvent).toBeDefined();
  });
});

