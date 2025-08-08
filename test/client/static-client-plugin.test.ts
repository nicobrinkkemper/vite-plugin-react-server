import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
  RenderMetrics,
} from "vite-plugin-react-server/types";
import { doBuildStaticClient } from "./doBuildStaticClient.js";

describe("Static Client Plugin test", () => {
  const testDir = resolve(__dirname, "../fixtures/static-client-plugin.test");
  let events: PluginEvent[];
  const metrics: RenderMetrics[] = [];
  let htmlContent: string;
  let rscContent: string;

  beforeAll(async () => {
    try {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);

      // Use the client static plugin specifically
      events = await doBuildStaticClient({
        projectRoot: testDir,
        verbose: true,
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
  });

  afterAll(async () => {
    try {
      // Clean up test directory if needed
    } catch {}
  });

  it("should use client static plugin for HTML generation", async () => {
    // Verify that the client static plugin was used
    expect(htmlContent).toBeDefined();
    expect(rscContent).toBeDefined();

    // Verify HTML content was generated on main thread (client plugin characteristic)
    expect(htmlContent).toContain("<html");
    expect(htmlContent).toContain("<div");
    expect(htmlContent).toContain("Page");
  });

  it("should collect metrics from client static plugin", async () => {
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
      // Note: There may be small differences due to content trimming
      const htmlLength = htmlContent?.length ?? 0;
      const rscLength = rscContent?.length ?? 0;
      expect(htmlLength).toBeGreaterThan(0);
      expect(rscLength).toBeGreaterThan(0);
      // Allow for small differences in content size (e.g., due to trimming)
      expect(Math.abs(htmlLength - metric.htmlSize)).toBeLessThanOrEqual(10);
      expect(Math.abs(rscLength - metric.rscSize)).toBeLessThanOrEqual(10);
    }
  });

  it("should emit file.write events for client static plugin", async () => {
    // Verify that file.write events were emitted
    const fileWriteEvents = events.filter((e) => e.type === "file.write");
    const fileWriteDoneEvents = events.filter(
      (e) => e.type === "file.write.done"
    );

    expect(fileWriteEvents.length).toBeGreaterThan(0);
    expect(fileWriteDoneEvents.length).toBeGreaterThan(0);

    // Should have both HTML and RSC file write events
    const htmlEvents = fileWriteDoneEvents.filter(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    );
    const rscEvents = fileWriteDoneEvents.filter(
      (e) => e.type === "file.write.done" && e.data.fileType === "rsc"
    );

    expect(htmlEvents.length).toBeGreaterThan(0);
    expect(rscEvents.length).toBeGreaterThan(0);

    // verify html content is not empty
    for (const htmlEvent of htmlEvents) {
      expect(htmlEvent.data.content).toBeDefined();
      expect(htmlEvent.data.content).not.toBe("");
    }

    // verify rsc content is not empty
    for (const rscEvent of rscEvents) {
      expect(rscEvent.data.content).toBeDefined();
      expect(rscEvent.data.content).not.toBe("");
    }

    // verify rsc stream file is headless
    for (const rscEvent of rscEvents) {
      expect(rscEvent.data.content).not.toContain("head");
    }

    // verify html stream file is not headless
    for (const htmlEvent of htmlEvents) {
      expect(htmlEvent.data.content).toContain("</head>");
    }
  });
});
