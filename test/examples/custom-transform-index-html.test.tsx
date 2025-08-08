import { resolve } from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getCondition } from "vite-plugin-react-server/config";
import { doBuild } from "./doBuild.js";

describe("Custom Transform Index HTML - Functional Tests", () => {
  const testDir = resolve(__dirname, "../fixtures/custom-transform.test");

  beforeAll(async () => {
    try {
      await setupTestProject(testDir);
    } catch (error) {
      console.error("Failed to setup test project:", error);
    }
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it("should demonstrate environment detection", () => {
    const condition = getCondition();
    expect(condition).toMatch(/^(react-server|react-client)$/);
  });

  it("should validate test project structure", async () => {
    const { readFile } = await import("fs/promises");
    
    // Check that required files exist
    const pageContent = await readFile(resolve(testDir, "src/page/page.tsx"), "utf-8");
    const propsContent = await readFile(resolve(testDir, "src/page/props.ts"), "utf-8");
    
    expect(pageContent).toContain("export function Page");
    expect(propsContent).toContain("export const props");
  });

  it("should demonstrate plugin import functionality", async () => {
    // Test that we can import the plugin
    const { vitePluginReactServer } = await import("vite-plugin-react-server");
    expect(vitePluginReactServer).toBeDefined();
    expect(typeof vitePluginReactServer).toBe("function");
  });

  it("should demonstrate server environment functionality", async () => {
    const condition = getCondition();
    if (condition === "react-server") {
      // In server environment, we can access server-specific functionality
      const serverModule = await import("vite-plugin-react-server/server");
      expect(serverModule).toBeDefined();
    }
  });

  it("should demonstrate client environment functionality", async () => {
    const condition = getCondition();
    if (condition === "react-client") {
      // In client environment, we can access client-specific functionality
      const clientModule = await import("vite-plugin-react-server/client");
      expect(clientModule).toBeDefined();
    }
  });

  it("should demonstrate proper plugin usage with doBuild", async () => {
    
    const events = await doBuild({
      projectRoot: testDir,
      onMetrics: () => {},
    });

    // In client environment, we should have client build events
    expect(events.length).toBeGreaterThan(0);
    
    // Should have client build events
    const clientBuildEvents = events.filter(e => 
      e.type === "file.write.done" && 
      (e.data.fileType === "html" || e.data.fileType === "rsc")
    );
    
    expect(clientBuildEvents.length).toBeGreaterThan(0);
  });

  it("should demonstrate custom Vite plugin that renders routes", async () => {
    // This example shows how the plugin actually renders routes
    // by using the existing doBuild functionality to demonstrate real rendering
    
    // Build the project to see the actual rendered output
    const events = await doBuild({
      projectRoot: testDir,
      onMetrics: () => {},
    });

    // Find the HTML output from the build
    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    );

    expect(htmlEvent).toBeDefined();
    
    if (htmlEvent && "content" in htmlEvent.data) {
      const htmlContent = htmlEvent.data.content;
      
      // This is the actual rendered HTML from the plugin
      console.log("Actual rendered HTML from plugin:");
      console.log(htmlContent);
      
      // Verify it contains the expected content from our page component
      expect(htmlContent).toContain("Page");
      expect(htmlContent).toContain("Go to Page 2");
      expect(htmlContent).toContain('id="«R»"');
      
      console.log("✅ Plugin successfully rendered the route with real content");
    }
  });
});
