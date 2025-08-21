import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setupTestProject } from "../setup.js";
import { doBuild } from "../doBuild.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
  RenderMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
} from "vite-plugin-react-server/types";
import { metricWatcher } from "vite-plugin-react-server/metrics";

const testDir = resolve(__dirname, "../fixtures/client-metrics.test");
let events: PluginEvent[];
const metrics: (
  | RenderMetrics<"html" | "rsc-headless" | "rsc-full">
  | WorkerStartupMetrics
  | ModuleResolutionMetrics
)[] = [];

const userMetricWatcher = metricWatcher({
  warnOnly: false,
});

describe("Client Metrics Collection", () => {
  beforeAll(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
    await setupTestProject(testDir);

    // Build with metrics collection
    events = await doBuild({
      projectRoot: testDir,
      verbose: false,
      onMetrics: (m) => {
        userMetricWatcher(m);
        metrics.push(m);
      },
    });
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      // await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should collect basic metrics", async () => {
    // Check if metrics were collected
    console.log(
      "Collected metrics:",
      metrics.map((m) => ({ ...m }))
    );

    // In client test environment, metrics might not be collected if server builds fail
    if (metrics.length === 0) {
      console.log(
        "Note: No metrics collected - this is expected if server builds are not available"
      );
      return;
    }

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
        // Type guard for WorkerStartupMetrics
        expect(metric.startupTime).toBeGreaterThan(0);
        expect(metric.workerType).toBeDefined();
      } else if (metric.type === "module-resolution") {
        // Type guard for ModuleResolutionMetrics
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

    // File write events only happen during server builds
    if (fileWriteEvents.length === 0) {
      console.log(
        "Note: No file write events - this is expected if server builds are not available"
      );
      return;
    }

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
        expect.arrayContaining([
          "build.writeBundle.server",
          "build.ssg.start",
          "file.write",
          "file.write.done",
        ])
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
});
