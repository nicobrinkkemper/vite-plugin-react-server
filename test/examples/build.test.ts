import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
  RenderMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
} from "vite-plugin-react-server/types";
import { doBuild } from "../doBuild.js";
import { getCondition } from "vite-plugin-react-server/config";

describe("plugin examples build test", () => {
  let testDir: string;
  let events: PluginEvent[];
  const metrics: (RenderMetrics | WorkerStartupMetrics | ModuleResolutionMetrics)[] = [];
  const htmlContent: string[] = [];
  const rscContent: string[] = [];
  
  beforeAll(async () => {
    // Determine test directory at runtime when conditions are properly set
    testDir = resolve(__dirname, `../fixtures/examples/${getCondition()}/build.test`);
    
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    events = await doBuild({
      projectRoot: testDir,
      verbose: true,
      onMetrics: (m) => {
        console.log("CLIENT METRICS COLLECTED:", m);
        metrics.push(m);
      },
      build: {
        pages: ['/', '/page2'],
      }
    });

    console.log("CLIENT BUILD COMPLETED. Total events:", events.length);
    console.log("Event types:", events.map(e => e.type));

    // Get HTML content from file.write.done events for all routes
    const htmlDoneEvents = events.filter(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "html"
    ) as FileWriteDoneEvent[];

    console.log("HTML done events:", htmlDoneEvents.length);

    for (const event of htmlDoneEvents) {
      htmlContent.push(event.data.content);
    }

    // Get RSC content from file.write.done events for all routes
    const rscDoneEvents = events.filter(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "rsc"
    ) as FileWriteDoneEvent[];

    console.log("RSC done events:", rscDoneEvents.length);

    for (const event of rscDoneEvents) {
      rscContent.push(event.data.content);
    }

    console.log("Client metrics collected:", metrics.length);
  });

  afterAll(async () => {
    try {
      // await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("emits build events in order", async () => {
    // Verify event order - client builds should always work
    const eventOrder = events.map((e) => e.type);
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
    const buildStartEvent = events.find((e) => e.type === "build.start");
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
    const clientBuildEvents = events.filter(e => 
      e.type === "build.writeBundle.client" ||
      e.type === "build.writeBundle.static"
    );
    
    expect(clientBuildEvents.length).toBeGreaterThan(0);
    console.log("Client build events:", clientBuildEvents.map(e => e.type));
    
    // Verify that client builds are working correctly
    // Note: SSG events are only available in server environment
    expect(events.some(e => e.type === "build.writeBundle.client")).toBe(true);
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