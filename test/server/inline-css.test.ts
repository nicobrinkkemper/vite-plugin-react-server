import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteDoneEvent } from "../../plugin/types.js";
import { doBuild } from "./doBuild.js";

describe("Plugin Inline Css Event hooks", () => {
  const testDir = resolve(__dirname, '../fixtures/inline-css.test');
  let events: PluginEvent[];
  let htmlContent: string;
  let rscContent: string;
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    events = await doBuild({
      projectRoot: testDir,
      css: {
        inlineCss: true,
        inlineThreshold: 0,
      }
    });

    // Get HTML content from file.write.done event
    const htmlDoneEvent = events.find(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "html" &&
        e.data.route === '/'
    ) as FileWriteDoneEvent;
    
    if (htmlDoneEvent) {
      htmlContent = htmlDoneEvent.data.content;
    }

    // Get RSC content from file.write.done event
    const rscDoneEvent = events.find(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "rsc" &&
        e.data.route === '/'
    ) as FileWriteDoneEvent;
    
    if (rscDoneEvent) {
      rscContent = rscDoneEvent.data.content;
    }
  });
  
  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("emits file.write events for html and rsc files", async () => {
    const fileWriteEvents = events.filter((e): e is FileWriteDoneEvent => e.type === "file.write.done");
    expect(fileWriteEvents.length).toBeGreaterThanOrEqual(2);
    
    // Find HTML and RSC file write events
    const htmlEvent = fileWriteEvents.find(e => e.data.fileType === "html");
    const rscEvent = fileWriteEvents.find(e => e.data.fileType === "rsc");
    
    expect(htmlEvent).toBeDefined();
    expect(rscEvent).toBeDefined();
    if (htmlEvent && rscEvent) {
      // Verify HTML content
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain("data-vite-dev-id");
      expect(htmlContent).toContain("</style>");
      
      // Verify RSC content
      expect(rscContent).toBeTruthy();
      // console.log(rscContent);
    }
  });
});
