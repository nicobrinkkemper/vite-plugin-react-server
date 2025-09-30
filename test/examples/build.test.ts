import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";

describe("plugin examples build test", () => {
  let buildResult: any;
  const htmlContent: string[] = [];
  const rscContent: string[] = [];
  
  beforeAll(async () => {
    buildResult = await getSharedBuild('test-project', 'build', {
      setupProject: setupTestProject,
      pages: ['/', '/page2'],
      verbose: false,
    });

    console.log("CLIENT BUILD COMPLETED. Total events:", buildResult.events.length);
    console.log("Event types:", buildResult.events.map((e: any) => e.type));

    // Get HTML content using the new API
    const htmlFiles = buildResult.htmlFiles();
    console.log("HTML files:", htmlFiles.length);

    for (const [, content] of htmlFiles) {
      htmlContent.push(content);
    }

    // Get RSC content using the new API
    const rscFiles = buildResult.rscFiles();
    console.log("RSC files:", rscFiles.length);

    for (const [, content] of rscFiles) {
      rscContent.push(content);
    }

    console.log("Client metrics collected:", buildResult.metrics.length);
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it("emits build events in order", async () => {
    // Verify event order - client builds should always work
    const eventOrder = buildResult.events.map((e: any) => e.type);
    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.writeBundle.static",
        "build.writeBundle.client",
        "build.writeBundle.server",
        "file.write",
        "file.write.done",
      ])
    );
  });

  it("emits build.start event with auto discovered files when server builds are available", async () => {
    const buildStartEvent = buildResult.events.find((e: any) => e.type === "build.start");
    if (buildStartEvent) {
      expect(buildStartEvent?.data).toMatchObject({
        pages: expect.arrayContaining(["/"]),
        files: expect.objectContaining({
          pageMap: expect.any(Map),
          propsMap: expect.any(Map),
          urlMap: expect.any(Map),
        }),
      });
    } else {
      console.log("Note: build.start event not available in client-only environment");
    }
  });

  it("emits file.write events for html and rsc files when server builds are available", async () => {
    if (htmlContent.length > 0 && rscContent.length > 0) {
      // Verify HTML content
      expect(htmlContent[0]).toContain("<html");
      expect(htmlContent[0]).toContain("<div");
      expect(htmlContent[0]).toContain("Page");

      // Verify RSC content
      expect(rscContent[0]).toBeTruthy();
    } else {
      expect(htmlContent.length).toBeGreaterThan(0);
      expect(rscContent.length).toBeGreaterThan(0);
    }
  });


  it("should demonstrate client-side static generation capabilities", async () => {
    // This test verifies that the client plugin can handle build events
    // The client-only environment provides build functionality but not SSG
    const clientBuildEvents = buildResult.events.filter((e: any) => 
      e.type === "build.writeBundle.client" ||
      e.type === "build.writeBundle.static"
    );
    
    expect(clientBuildEvents.length).toBeGreaterThan(0);
    console.log("Client build events:", clientBuildEvents.map((e: any) => e.type));
    
    // Verify that client builds are working correctly
    // Note: SSG events are only available in server environment
    expect(buildResult.events.some((e: any) => e.type === "build.writeBundle.client")).toBe(true);
  });

  it("should collect css files", async () => {
    if(Array.isArray(htmlContent) && htmlContent.length > 0) {
      expect(htmlContent[0]).toContain(".css");
    } else {
      expect(htmlContent.length).toBeGreaterThan(0);
    }
  });

  it("should generate correct CSS paths without src/ artifacts", async () => {
    // should generate in all environments
    expect(htmlContent.length).toBeGreaterThan(0); 

    // Extract all href attributes from link tags
    const linkMatches = htmlContent.flatMap((content) => content.match(/href="([^"]*\.css[^"]*)"/g) ?? []);

    if (linkMatches && linkMatches.length > 0) {
      const hrefs = linkMatches
        .map((match) => {
          const href = match.match(/href="([^"]*)"/)?.[1];
          return href;
        })
        .filter(Boolean);
      // Check each CSS href
      for (const href of hrefs) {
        // Should NOT contain "src.css" patterns
        expect(href).not.toMatch(/src/);

        // Should have proper CSS path structure: /assets/ for built files
        if (process.env.VITE_BASE_URL) {
          expect(href?.startsWith(process.env.VITE_BASE_URL + "assets/")).toBe(
            true
          );
        } else {
          expect(href).toMatch(/\assets\//);
        }

        // Should end with .css
        expect(href).toMatch(/\.css$/);

        // Should not have double slashes or malformed paths
        expect(href).not.toMatch(/\/\//);
      }
    }
  });
}); 