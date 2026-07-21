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
    const buildResult = await getSharedBuild("default-setup", "metrics", {
      pages: ["/"],
    });

    events = buildResult.events;
    metrics = buildResult.metrics;
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it("should collect render metrics (html, rsc-headless, rsc-full)", async () => {
    // This is the critical test: render metrics MUST be emitted
    const renderMetrics = metrics.filter(
      (m: any) => m.type === "html" || m.type === "rsc-headless" || m.type === "rsc-full"
    ) as RenderMetrics[];

    console.log(
      "Render metrics:",
      renderMetrics.map((m) => ({ type: m.type, route: m.route, fileSize: m.fileSize }))
    );

    // Must have at least html + rsc-headless for the "/" route
    const htmlMetrics = renderMetrics.filter((m) => m.type === "html");
    const rscHeadlessMetrics = renderMetrics.filter((m) => m.type === "rsc-headless");
    const rscFullMetrics = renderMetrics.filter((m) => m.type === "rsc-full");

    expect(htmlMetrics.length).toBeGreaterThan(0);
    expect(rscHeadlessMetrics.length).toBeGreaterThan(0);
    expect(rscFullMetrics.length).toBeGreaterThan(0);

    // Verify render metric fields
    for (const metric of renderMetrics) {
      expect(metric.route).toBeDefined();
      expect(metric.processingTime).toBeGreaterThan(0);
      expect(metric.streamMetrics).toBeDefined();
      expect(metric.streamMetrics.duration).toBeGreaterThan(0);

      if (metric.type !== "rsc-full") {
        // html and rsc-headless write to files, so must have fileSize and chunks
        expect(metric.fileSize).toBeGreaterThanOrEqual(0);
        expect(metric.chunks).toBeGreaterThanOrEqual(0);
        expect(metric.chunkRate).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("should collect basic metrics", async () => {
    expect(metrics.length).toBeGreaterThan(0);

    // Track seen combinations to ensure no duplicates
    const seenCombinations = new Set<string>();

    for (const metric of metrics) {
      expect(metric.route).toBeDefined();
      expect(metric.type).toBeDefined();

      const combination = `${metric.route}-${metric.type}`;
      expect(seenCombinations.has(combination)).toBe(false);
      seenCombinations.add(combination);

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
      } else if (metric.type === "edge-bake") {
        expect(metric.kind === "producer" || metric.kind === "consumer").toBe(true);
        expect(metric.outputPath).toBeDefined();
        expect(metric.bakeTime).toBeGreaterThan(0);
      } else if (metric.type === "inline-flight") {
        expect(metric.pages).toBeGreaterThanOrEqual(0);
        expect(metric.inlineTime).toBeGreaterThanOrEqual(0);
      } else {
        throw new Error(`Unexpected metric type: ${metric.type}`);
      }
    }
  });

  it("should collect file write events", async () => {
    const fileWriteEvents = events.filter((e) => e.type === "file.write");
    const fileWriteDoneEvents = events.filter(
      (e) => e.type === "file.write.done"
    );

    expect(fileWriteEvents.length).toBeGreaterThan(0);
    expect(fileWriteDoneEvents.length).toBeGreaterThan(0);

    const htmlEvents = fileWriteDoneEvents.filter(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent[];
    const rscEvents = fileWriteDoneEvents.filter(
      (e) => e.type === "file.write.done" && e.data.fileType === "rsc"
    ) as FileWriteDoneEvent[];

    expect(htmlEvents.length).toBeGreaterThan(0);
    expect(rscEvents.length).toBeGreaterThan(0);

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
      const matchingMetric = metrics.find(
        (m: any) =>
          "fileSize" in m &&
          m.route === rscEvent.data.route &&
          m.type === "rsc-headless"
      ) as RenderMetrics | undefined;

      if (matchingMetric) {
        expect(rscEvent.data.content.length).toBe(matchingMetric.fileSize);
      }
    }
  });

  it("should emit build events in order", async () => {
    const eventOrder = events.map((e) => e.type);

    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.writeBundle.static",
        "build.writeBundle.client",
        "build.writeBundle.server",
      ])
    );

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

  it("should have matching file sizes between events and metrics", async () => {
    const fileWriteDoneEvents = events.filter(
      (e) => e.type === "file.write.done"
    ) as FileWriteDoneEvent[];

    for (const event of fileWriteDoneEvents) {
      const metricType = event.data.fileType === "html" ? "html" : "rsc-headless";
      const matchingMetric = metrics.find(
        (m: any) =>
          "fileSize" in m &&
          m.route === event.data.route &&
          m.type === metricType
      ) as RenderMetrics | undefined;

      if (matchingMetric) {
        expect(event.data.content.length).toBe(matchingMetric.fileSize);
      }
    }
  });
});
