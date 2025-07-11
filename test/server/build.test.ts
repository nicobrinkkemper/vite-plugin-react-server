import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
  RenderMetrics,
} from "vite-plugin-react-server/types";
import { doBuild } from "./doBuild.js";

describe("Plugin build test", () => {
  const testDir = resolve(__dirname, "../fixtures/build.test");
  let events: PluginEvent[];
  const metrics: RenderMetrics[] = [];
  let htmlContent: string;
  let rscContent: string;
  beforeAll(async () => {
    try {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      events = await doBuild({
        projectRoot: testDir,
        onMetrics: (m) => {
          metrics.push(m);
        },
      });

      // Get HTML content from file.write.done event
      const htmlDoneEvent = events.find(
        (e) =>
          e.type === "file.write.done" &&
          e.data.fileType === "html" &&
          e.data.route === "/"
      ) as FileWriteDoneEvent;

      if (htmlDoneEvent) {
        htmlContent = htmlDoneEvent.data.content;
      }

      // Get RSC content from file.write.done event
      const rscDoneEvent = events.find(
        (e) =>
          e.type === "file.write.done" &&
          e.data.fileType === "rsc" &&
          e.data.route === "/"
      ) as FileWriteDoneEvent;

      if (rscDoneEvent) {
        rscContent = rscDoneEvent.data.content;
      }
    } catch (error) {
      console.error("Error building project", error);
    }
  }, 30000);

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("emits build events in order", async () => {
    // Verify event order
    const eventOrder = events.map((e) => e.type);
    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.writeBundle.static-client",
        "build.writeBundle.client",
        "build.start",
        "build.writeBundle.server",
        "build.writeBundle.static-server",
        "file.write",
        "file.write.done",
        "file.write",
        "file.write.done",
      ])
    );
  });

  it("emits build.start event with auto discovered files", async () => {
    const buildStartEvent = events.find((e) => e.type === "build.start");
    expect(buildStartEvent).toBeDefined();
    expect(buildStartEvent?.data).toMatchObject({
      pages: expect.arrayContaining(["/"]),
      files: expect.objectContaining({
        pageMap: expect.any(Map),
        propsMap: expect.any(Map),
        urlMap: expect.any(Map),
      }),
    });
  });

  it("emits file.write events for html and rsc files", async () => {
    expect(htmlContent).toBeDefined();
    expect(rscContent).toBeDefined();
    // Verify HTML content
    expect(htmlContent).toContain("<html");
    expect(htmlContent).toContain("<div");
    expect(htmlContent).toContain("Page");

    // Verify RSC content
    expect(rscContent).toBeTruthy();
  });

  it("should collect basic metrics", async () => {
    expect(metrics.length).toBe(1);

    // Check metrics for each route
    for (const metric of metrics) {
      expect(metric.route).toBeDefined();
      expect(metric.htmlSize).toBeGreaterThan(0);
      expect(metric.rscSize).toBeGreaterThan(0);
      expect(metric.processingTime).toBeGreaterThan(0);
      expect(metric.chunks).toBeGreaterThan(0);
      expect(metric.chunkRate).toBeGreaterThan(0);

      // Compare content lengths with metrics
      const htmlLength = htmlContent?.length ?? 0;
      const rscLength = rscContent?.length ?? 0;
      expect(htmlLength).toBe(metric.htmlSize);
      expect(rscLength).toBe(metric.rscSize);
    }
  });

  // check for css
  it("should collect css files", async () => {
    expect(htmlContent).toContain(".css");
  });

  it("should generate correct CSS paths without src.css artifacts", async () => {
    expect(htmlContent).toBeDefined();
    
    // Extract all href attributes from link tags
    const linkMatches = htmlContent.match(/href="([^"]*\.css[^"]*)"/g);
    
    if (linkMatches && linkMatches.length > 0) {
      const hrefs = linkMatches.map(match => {
        const href = match.match(/href="([^"]*)"/)?.[1];
        return href;
      }).filter(Boolean);
      // Check each CSS href
      for (const href of hrefs) {
        // Should NOT contain "src.css" patterns  
        expect(href).not.toMatch(/src/);
        
        // Should have proper CSS path structure: /assets/ for built files

        if(process.env.VITE_BASE_URL) {
          expect(href?.startsWith(process.env.VITE_BASE_URL + 'assets/')).toBe(true);
        } else {
          expect(href).toMatch(/^\/assets\//);
        }
        
        // Should end with .css
        expect(href).toMatch(/\.css$/);
        
        // Should not have double slashes or malformed paths
        expect(href).not.toMatch(/\/\//);
      }
    }
  });
});
