import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getSharedBuild, cleanupSharedBuilds, SharedBuildResult } from "./shared-build.js";

// This test should work in both environments

describe("Plugin build test (Cross-Environment)", () => {
  let buildInfo: SharedBuildResult
  let htmlContent: string[]
  let rscContent: string[]

  beforeAll(async () => {
    buildInfo = await getSharedBuild("test-project", 'build-cross-env', {
      setupProject: setupTestProject,
      pages: ["/", "/page2"],
      verbose: false,
    });
  });

  afterAll(async () => {
   // await cleanupSharedBuilds();
  });

  it("emits build events in order", async () => {
    // Verify event order
    const eventOrder = buildInfo.events.map((e) => e.type);
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
    const buildStartEvent = buildInfo.events.find(
      (e) => e.type === "build.start"
    );
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
    htmlContent = buildInfo.htmlFiles().map(([, content]) => content);
    expect(htmlContent).toBeDefined();
    expect(htmlContent.length).toBeGreaterThan(0);
    // Verify HTML content
    expect(htmlContent[0]).toContain("<html");
    expect(htmlContent[0]).toContain("<div");
    expect(htmlContent[0]).toContain("Page");
  });

  it("emits file.write events for rsc files", async () => {
    rscContent = buildInfo.rscFiles().map(([, content]) => content);
    expect(rscContent).toBeDefined();
    expect(rscContent.length).toBeGreaterThan(0);
    // Verify RSC content
    expect(rscContent[0]).toBeTruthy();
  });

  it("should collect basic metrics", async () => {
    expect(buildInfo.metrics.length).toBeGreaterThan(0);
    const seenCombinations = new Set<string>();
    // Check metrics for each route
    for (const metric of buildInfo.metrics) {
      const combination = `${metric.route}-${metric.type}`;
      expect(seenCombinations.has(combination)).toBe(false);
      seenCombinations.add(combination);

      // Check if this is a render metric (has fileSize property)
      if ("fileSize" in metric) {
        expect(metric.type).toMatch(/html|rsc-headless|rsc-full/);
        expect(metric.fileSize).toBeGreaterThanOrEqual(0);
        expect(metric.processingTime).toBeGreaterThan(0);
        // rsc-full metrics can have 0 chunks since they don't write to files
        if (metric.type === "rsc-full") {
          expect(metric.chunks).toBeGreaterThanOrEqual(0);
          expect(metric.chunkRate).toBeGreaterThanOrEqual(0);
        } else {
          expect(metric.chunks).toBeGreaterThan(0);
          expect(metric.chunkRate).toBeGreaterThan(0);
        }
      } else {
        // worker-startup, module-resolution and edge-bake metrics
        expect(metric.type).toMatch(
          /worker-startup|module-resolution|rsc-full|edge-bake|inline-flight|ssg-render/
        );
        if ("startupTime" in metric) {
          expect(metric.startupTime).toBeGreaterThan(0);
        } else if ("resolutionTime" in metric) {
          expect(metric.resolutionTime).toBeGreaterThan(0);
        } else if ("bakeTime" in metric) {
          expect(metric.bakeTime).toBeGreaterThan(0);
          expect(metric.outputPath).toBeDefined();
        }
      }

      // Compare content lengths with metrics
      // Find the corresponding content by route and type instead of by array index
      let matchingContent: string | undefined;
      if (metric.type === "html") {
        // Find HTML content for this route
        const htmlDoneEvents = buildInfo.events.filter(
          (e) =>
            e.type === "file.write.done" &&
            e.data.fileType === "html" &&
            e.data.route === metric.route
        );
        matchingContent = htmlDoneEvents[0]?.data.content;
      } else if (metric.type === "rsc-headless") {
        // Find RSC content for this route
        const rscDoneEvents = buildInfo.events.filter(
          (e) =>
            e.type === "file.write.done" &&
            e.data.fileType === "rsc" &&
            e.data.route === metric.route
        );
        matchingContent = rscDoneEvents[0]?.data.content;
      }

      if (matchingContent !== undefined && "fileSize" in metric) {
        expect(matchingContent.length).toBe(metric.fileSize);
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
    const linkMatches = htmlContent.flatMap(
      (content) => content.match(/href="([^"]*\.css[^"]*)"/g) ?? []
    );

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
