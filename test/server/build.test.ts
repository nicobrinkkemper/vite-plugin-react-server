import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join, resolve } from "path";
import { mkdir, readFile, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteEvent,
  RenderMetrics,
} from "../../plugin/types.js";
import { doBuild } from "./doBuild.js";

describe("Plugin build test", () => {
  const testDir = resolve(__dirname, "../fixtures/build.test");
  let events: PluginEvent[];
  const metrics: RenderMetrics[] = [];
  let htmlContent: string;
  let rscContent: string;
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    events = await doBuild({
      projectRoot: testDir,
      onMetrics: (m) => {
        console.log("Test Metric", m.route, m.htmlSize, m.rscSize);
        metrics.push(m);
      },
    });
    
    htmlContent = events.find(
      (e) =>
        e.type === "file.write" &&
        e.data.fileType === "html" &&
        e.data.route === '/'
    )?.data["content"];

    rscContent = events.find(
      (e) =>
        e.type === "file.write" &&
        e.data.fileType === "rsc" &&
        e.data.route === '/'
    )?.data["content"];
  });

  afterAll(async () => {
    // await rm(testDir, { recursive: true, force: true });
  });

  it("emits build events", async () => {
    // Verify build.start comes first
    expect(events[0].type).toBe("build.start");
  });

  it("emits build events in order", async () => {
    // Verify event order
    const eventOrder = events.map((e) => e.type);
    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.start",
        "build.writeBundle",
        "file.write",
        "file.write",
      ])
    );
  });

  it("emits build.start event with auto discovered files", async () => {
    const buildStartEvent = events.find((e) => e.type === "build.start");
    expect(buildStartEvent).toBeDefined();
    expect(buildStartEvent?.data).toMatchObject({
      pages: expect.arrayContaining(["/"]),
      files: expect.objectContaining({
        pageSet: expect.any(Set),
        propsSet: expect.any(Set),
        pageMap: expect.any(Map),
        propsMap: expect.any(Map),
        urlMap: expect.any(Map),
      }),
    });
  });

  it("emits file.write events for html and rsc files", async () => {
    expect(htmlContent).toBeDefined();
    expect(rscContent).toBeDefined();
    if (htmlContent && rscContent) {
      // Verify HTML content
      expect(htmlContent).toContain("<html");
      expect(htmlContent).toContain("<div");
      expect(htmlContent).toContain("Page");

      // Verify RSC content
      expect(rscContent).toBeTruthy();
    }
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

      expect(htmlContent?.length).toBe(metric.htmlSize);
      expect(rscContent?.length).toBe(metric.rscSize);
    }
  });
});
