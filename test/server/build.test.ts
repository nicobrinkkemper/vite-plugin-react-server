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
import { getCondition } from "vite-plugin-react-server/config";

if (getCondition() !== "react-server") {
  throw new Error("This test is only valid in a react-server environment");
}

describe("Plugin build test", () => {
  const testDir = resolve(__dirname, "../fixtures/build.test");
  let events: PluginEvent[];
  const metrics: (RenderMetrics | WorkerStartupMetrics | ModuleResolutionMetrics)[] = [];
  const htmlContent: string[] = [];
  const rscContent: string[] = [];
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    events = await doBuild({
      projectRoot: testDir,
      verbose: true,
      onMetrics: (m) => {
        console.log("METRICS COLLECTED:", m);
        metrics.push(m);
      },
      build: {
        pages: ['/', '/page2'],
      }
    });

    console.log("BUILD COMPLETED. Total events:", events.length);
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

    console.log("Metrics collected:", metrics.length);
  });

  afterAll(async () => {
    try {
      //  await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("emits build events in order", async () => {
    // Verify event order
    const eventOrder = events.map((e) => e.type);
    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.ssg.start",
        "build.writeBundle.client",
        "build.start",
        "build.writeBundle.server",
        "build.ssg.end",
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
    expect(htmlContent.length).toBeGreaterThan(0);
    expect(rscContent.length).toBeGreaterThan(0);
    // Verify HTML content
    expect(htmlContent[0]).toContain("<html");
    expect(htmlContent[0]).toContain("<div");
    expect(htmlContent[0]).toContain("Page");

    // Verify RSC content
    expect(rscContent[0]).toBeTruthy();
  });

  it("should collect basic metrics", async () => {
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
      } else if (metric.type === "rsc-headless") {
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

  // check for css
  it("should collect css files", async () => {
    // After the metrics test, htmlContent should still have content for /page2
    expect(htmlContent.length).toBeGreaterThan(0);
    expect(htmlContent[0]).toContain(".css");
  });

  it("should generate correct CSS paths without src.css artifacts", async () => {
    expect(htmlContent).toBeTruthy();

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
