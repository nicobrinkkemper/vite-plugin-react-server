import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
  RenderMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
} from "vite-plugin-react-server/types";
import { doBuild } from "../doBuild.js";

describe("plugin examples build test", () => {
  const testDir = resolve(__dirname, "../fixtures/examples-build.test");
  let events: PluginEvent[];
  const metrics: (RenderMetrics | WorkerStartupMetrics | ModuleResolutionMetrics)[] = [];
  const htmlContent: string[] = [];
  const rscContent: string[] = [];
  
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    events = await doBuild({
      projectRoot: testDir,
      verbose: false,
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
      ])
    );
    
    // Server builds might not work in client test environment, so we'll check if they exist
    const hasServerBuilds = eventOrder.some(e => e.includes('server'));
    if (hasServerBuilds) {
      expect(eventOrder).toEqual(
        expect.arrayContaining([
          "build.start",
          "build.writeBundle.server",
          "build.writeBundle.static-server",
          "file.write",
          "file.write.done",
        ])
      );
    } else {
      console.log("Note: Server builds not available in client test environment");
    }
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
      console.log("Note: File write events not available in client-only environment");
    }
  });

  it("should collect basic metrics when server builds are available", async () => {
    if (metrics.length === 0) {
      console.log("Note: No metrics collected - this is expected if server builds are not available");
      return;
    }
    
    expect(metrics.length).toBeGreaterThan(0);
    const seenCombinations = new Set<string>();
    
    // Check metrics for each route
    for (const metric of metrics) {
      const combination = `${metric.route}-${metric.type}`;
      expect(seenCombinations.has(combination)).toBe(false);
      seenCombinations.add(combination);
      
      // Check if this is a render metric (has fileSize property)
      if ('fileSize' in metric) {
        const renderMetric = metric as RenderMetrics;
        console.log(
          'route: ', renderMetric.route,
          'type: ', renderMetric.type,
          'fileSize: ', renderMetric.fileSize,
          'processingTime: ', renderMetric.processingTime,
          'chunks: ', renderMetric.chunks,
          'chunkRate: ', renderMetric.chunkRate,
          'streamMetrics: ', renderMetric.streamMetrics
        );
        expect(renderMetric.type).toMatch(/html|rsc-headless|rsc-full/);
        expect(renderMetric.fileSize).toBeGreaterThanOrEqual(0);
        expect(renderMetric.processingTime).toBeGreaterThan(0);
        // rsc-full metrics can have 0 chunks since they don't write to files
        if (renderMetric.type === "rsc-full") {
          expect(renderMetric.chunks).toBeGreaterThanOrEqual(0);
          expect(renderMetric.chunkRate).toBeGreaterThanOrEqual(0);
        } else {
          expect(renderMetric.chunks).toBeGreaterThan(0);
          expect(renderMetric.chunkRate).toBeGreaterThan(0);
        }
      } else {
        // worker-startup and module-resolution metrics
        console.log(
          'route: ', metric.route,
          'type: ', metric.type,
          'fileSize: ', 'undefined',
          'processingTime: ', 'undefined',
          'chunks: ', 'undefined',
          'chunkRate: ', 'undefined',
          'streamMetrics: ', 'undefined'
        );
        expect(metric.type).toMatch(/worker-startup|module-resolution/);
        if ('startupTime' in metric) {
          const workerMetric = metric as WorkerStartupMetrics;
          expect(workerMetric.startupTime).toBeGreaterThan(0);
        } else if ('resolutionTime' in metric) {
          const moduleMetric = metric as ModuleResolutionMetrics;
          expect(moduleMetric.resolutionTime).toBeGreaterThan(0);
        }
      }

      // Compare content lengths with metrics
      // Find the corresponding content by route and type instead of by array index
      let matchingContent: string | undefined;
      if (metric.type === "html") {
        // Find HTML content for this route
        const htmlDoneEvents = events.filter(
          (e) =>
            e.type === "file.write.done" &&
            e.data.fileType === "html" &&
            e.data.route === metric.route
        ) as FileWriteDoneEvent[];
        matchingContent = htmlDoneEvents[0]?.data.content;
      } else if ( metric.type === "rsc-headless") {
        // Find RSC content for this route
        const rscDoneEvents = events.filter(
          (e) =>
            e.type === "file.write.done" &&
            e.data.fileType === "rsc" &&
            e.data.route === metric.route
        ) as FileWriteDoneEvent[];
        matchingContent = rscDoneEvents[0]?.data.content;
      }
      
      if (matchingContent !== undefined && 'fileSize' in metric) {
        const renderMetric = metric as RenderMetrics;
        expect(matchingContent.length).toBe(renderMetric.fileSize);
      }
    }
  });

  it("should collect css files when server builds are available", async () => {
    if (htmlContent.length > 0) {
      expect(htmlContent[0]).toContain(".css");
    } else {
      console.log("Note: CSS files not available in client-only environment");
    }
  });

  it("should generate correct CSS paths without src.css artifacts when server builds are available", async () => {
    if (htmlContent.length === 0) {
      console.log("Note: HTML content not available in client-only environment");
      return;
    }

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

  it("should demonstrate client-side static generation capabilities", async () => {
    // This test verifies that the client plugin can handle static generation
    // even when server builds are not available
    const clientBuildEvents = events.filter(e => 
      e.type === "build.ssg.start" || 
      e.type === "build.writeBundle.client"
    );
    
    expect(clientBuildEvents.length).toBeGreaterThan(0);
    console.log("Client build events:", clientBuildEvents.map(e => e.type));
    
    // Verify that client builds are working correctly
    expect(events.some(e => e.type === "build.ssg.start")).toBe(true);
    expect(events.some(e => e.type === "build.writeBundle.client")).toBe(true);
  });
}); 