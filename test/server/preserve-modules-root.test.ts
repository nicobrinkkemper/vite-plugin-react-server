import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent } from "../../dist/plugin/types.js";
import { doBuild } from "./doBuild.js";

describe("preserveModulesRoot", () => {
  const testDir = resolve(__dirname, "../fixtures/preserve-modules-root.test");
  let events: PluginEvent[];

  beforeAll(async () => {
    try {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      
      // Build once with preserveModulesRoot: true
      const config = {
        projectRoot: testDir,
        moduleBase: "src",
        Page: "src/page/page.tsx",
        props: "src/page/props.ts",
        build: {
          pages: ["/"],
          preserveModulesRoot: true,
        },
      };

      events = await doBuild(config);
    } catch (error) {
      console.error("Error building project", error);
    }
  }, 30000);

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up test project", error);
    }
  });

  it("should emit build events when preserveModulesRoot is true", async () => {
    // Verify build completed successfully by checking for expected events
    const buildStartEvent = events.find((e) => e.type === "build.start");
    expect(buildStartEvent).toBeDefined();
    
    const fileWriteDoneEvents = events.filter((e) => e.type === "file.write.done");
    expect(fileWriteDoneEvents.length).toBeGreaterThan(0);
  });

  it("should emit file.write events for html and rsc files", async () => {
    const htmlDoneEvent = events.find(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "html" &&
        e.data.route === "/"
    );
    expect(htmlDoneEvent).toBeDefined();

    const rscDoneEvent = events.find(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "rsc" &&
        e.data.route === "/"
    );
    expect(rscDoneEvent).toBeDefined();
  });

  it("should complete build successfully with preserveModulesRoot enabled", async () => {
    // Check that we have the expected build events
    const buildEvents = events.filter(e => 
      e.type === "build.writeBundle.client" || 
      e.type === "build.writeBundle.static-client" ||
      e.type === "build.writeBundle.server" ||
      e.type === "build.writeBundle.static-server"
    );
    expect(buildEvents.length).toBeGreaterThan(0);
  });

  it("should preserve src directory structure when preserveModulesRoot is true", async () => {
    // Check that the build output preserves the src directory structure
    // Look for files that still have "src" in their paths
    const buildEvents = events.filter(e => 
      e.type === "build.writeBundle.client" || 
      e.type === "build.writeBundle.static-client" ||
      e.type === "build.writeBundle.server" ||
      e.type === "build.writeBundle.static-server"
    );
    
    // The build should complete successfully
    expect(buildEvents.length).toBeGreaterThan(0);
    
    // Check that the output files preserve the src structure
    // This would be visible in the bundle output paths
    const hasSrcInPaths = buildEvents.some(event => {
      if (event.type === "build.writeBundle.static-client" || event.type === "build.writeBundle.static-server") {
        // Check if any of the output files contain "src" in their paths
        return Object.keys(event.data.bundle).some(filePath => filePath.includes("src"));
      }
      return false;
    });
    
    expect(hasSrcInPaths).toBe(true);
  });
}); 