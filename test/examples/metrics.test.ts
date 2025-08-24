import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getSharedBuild, cleanupSharedBuilds } from "./shared-build.js";
import {
  FileWriteDoneEvent,
  ModuleResolutionMetrics,
  RenderMetrics,
  WorkerStartupMetrics,
} from "vite-plugin-react-server/types";

let events: any[];
let metrics: any[];

describe("Metrics Collection", () => {
  beforeAll(async () => {
    const buildResult = await getSharedBuild("default-setup", {
      setupProject: setupTestProject,
    });

    events = buildResult.events;
    metrics = buildResult.metrics;
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it("should collect basic metrics", async () => {
    // Check if metrics were collected
    console.log(
      "Collected metrics:",
      metrics.map((m) => ({ ...m }))
    );

    expect(metrics.length).toBeGreaterThan(0);

    // Track seen combinations to ensure no duplicates
    const seenCombinations = new Set<string>();

    for (const metric of metrics) {
      // All metrics should have a route and type
      expect(metric.route).toBeDefined();
      expect(metric.type).toBeDefined();

      // Check for duplicate route-type combinations
      const combination = `${metric.route}-${metric.type}`;
      expect(seenCombinations.has(combination)).toBe(false);
      seenCombinations.add(combination);

      // Check different metric types
      if (metric.type === "html" || metric.type === "rsc-headless") {
        expect(metric.fileSize).toBeGreaterThanOrEqual(0);
        expect(metric.streamMetrics.duration).toBeGreaterThan(0);
        expect(metric.streamMetrics.chunks).toBeGreaterThanOrEqual(0);
        expect(metric.chunkRate).toBeGreaterThanOrEqual(0);
      } else if (metric.type === "rsc-full") {
        expect(metric.streamMetrics.chunks).toBeGreaterThanOrEqual(0);
        expect(metric.chunkRate).toBeGreaterThanOrEqual(0);
      } else if (metric.type === "worker-startup") {
        expect(metric.startupTime).toBeGreaterThan(0);
        expect(metric.workerType).toBeDefined();
      } else if (metric.type === "module-resolution") {
        expect(metric.resolutionTime).toBeGreaterThan(0);
        expect(metric.workerType).toBeDefined();
      } else {
        // Unknown metric type
        throw new Error(`Unexpected metric type: ${metric.type}`);
      }
    }
  });

  it("should collect file write events", async () => {
    // Check that file.write events were emitted
    const fileWriteEvents = events.filter((e) => e.type === "file.write");
    const fileWriteDoneEvents = events.filter(
      (e) => e.type === "file.write.done"
    );


    expect(fileWriteEvents.length).toBeGreaterThan(0);
    expect(fileWriteDoneEvents.length).toBeGreaterThan(0);

    // Should have both HTML and RSC file write events
    const htmlEvents = fileWriteDoneEvents.filter(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent[];
    const rscEvents = fileWriteDoneEvents.filter(
      (e) => e.type === "file.write.done" && e.data.fileType === "rsc"
    ) as FileWriteDoneEvent[];

    expect(htmlEvents.length).toBeGreaterThan(0);
    expect(rscEvents.length).toBeGreaterThan(0);

    // Verify content is not empty
    for (const htmlEvent of htmlEvents) {
      expect(htmlEvent.data.content).toBeDefined();
      expect(htmlEvent.data.content).not.toBe("");
    }

    for (const rscEvent of rscEvents) {
      expect(rscEvent.data.content).toBeDefined();
      expect(rscEvent.data.content).not.toBe("");
    }

    // Verify content matches metrics
    for (const rscEvent of rscEvents) {
      const matchingContent = rscEvent.data.content;
      const matchingMetric = metrics.find(
        (m) =>
          "fileSize" in m &&
          m.route === rscEvent.data.route &&
          m.type === "rsc-headless"
      ) as RenderMetrics | undefined;

      if (matchingContent !== undefined && matchingMetric) {
        expect(matchingContent.length).toBe(matchingMetric.fileSize);
      }
    }
  });

  it("should emit build events in order", async () => {
    const eventOrder = events.map((e) => e.type);
    console.log("Event order:", eventOrder);

    // Always expect these in client metrics run
    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.writeBundle.static",
        "build.writeBundle.client",
        "build.writeBundle.server",
      ])
    );

    // If server-side pieces ran, we should also see their signals
    const hasServer = eventOrder.includes("build.writeBundle.server");
    const hasSgg =
      eventOrder.includes("build.ssg.start") ||
      eventOrder.includes("build.ssg.end");
    const hasFileWrites = eventOrder.some(
      (e) => e === "file.write" || e === "file.write.done"
    );

    if (hasServer || hasSgg || hasFileWrites) {
      expect(eventOrder).toEqual(
        expect.arrayContaining(["build.writeBundle.server"])
      );
      if (hasSgg) {
        expect(eventOrder).toEqual(
          expect.arrayContaining(["build.ssg.start", "build.ssg.end"])
        );
      }
      if (hasFileWrites) {
        expect(eventOrder).toEqual(
          expect.arrayContaining(["file.write", "file.write.done"])
        );
      }
    }
  });

  it("should collect basic metrics when server builds are available", async () => {
    const seenCombinations = new Set<string>();

    // Check metrics for each route
    for (const metric of metrics) {
      const combination = `${metric.route}-${metric.type}`;
      expect(seenCombinations.has(combination)).toBe(false);
      seenCombinations.add(combination);

      // Check if this is a render metric (has fileSize property)
      if ("fileSize" in metric) {
        const renderMetric = metric as RenderMetrics;
        console.log(
          "route: ",
          renderMetric.route,
          "type: ",
          renderMetric.type,
          "fileSize: ",
          renderMetric.fileSize,
          "processingTime: ",
          renderMetric.processingTime,
          "chunks: ",
          renderMetric.chunks,
          "chunkRate: ",
          renderMetric.chunkRate,
          "streamMetrics: ",
          renderMetric.streamMetrics
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
          "route: ",
          metric.route,
          "type: ",
          metric.type,
          "fileSize: ",
          "undefined",
          "processingTime: ",
          "undefined",
          "chunks: ",
          "undefined",
          "chunkRate: ",
          "undefined",
          "streamMetrics: ",
          "undefined"
        );
        if (metric.type === "worker-startup") {
          const workerMetric = metric as WorkerStartupMetrics;
          expect(workerMetric.startupTime).toBeGreaterThan(0);
        } else if (metric.type === "module-resolution") {
          const moduleMetric = metric as ModuleResolutionMetrics;
          expect(moduleMetric.resolutionTime).toBeGreaterThan(0);
        } else if (metric.type === "rsc-full") {
          // rsc-full metrics don't have fileSize but have streamMetrics
          expect(metric.streamMetrics).toBeDefined();
          expect(metric.streamMetrics.chunks).toBeGreaterThanOrEqual(0);
          expect(metric.streamMetrics.duration).toBeGreaterThanOrEqual(0);
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

      if (matchingContent !== undefined && "fileSize" in metric) {
        const renderMetric = metric as RenderMetrics;
        expect(matchingContent.length).toBe(renderMetric.fileSize);
      }
    }
  });
});
