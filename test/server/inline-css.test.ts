import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteEvent } from "../../plugin/types.js";
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
    await rm(testDir, { recursive: true, force: true });
  });


  it("emits file.write events for html and rsc files", async () => {
    const fileWriteEvents = events.filter((e): e is FileWriteEvent => e.type === "file.write");
    expect(fileWriteEvents.length).toBeGreaterThanOrEqual(2);
    
    // Find HTML and RSC file write events
    const htmlEvent = fileWriteEvents.find(e => e.data.fileType === "html");
    const rscEvent = fileWriteEvents.find(e => e.data.fileType === "rsc");
    
    expect(htmlEvent).toBeDefined();
    expect(rscEvent).toBeDefined();
    if (htmlEvent && rscEvent) {
      // Verify HTML content
      expect(htmlEvent.data.content).toContain("data-vite-dev-id");
      expect(htmlEvent.data.content).toContain("</style>");
      
      // Verify RSC content
      expect(rscEvent.data.content).toBeTruthy();
    }
  });

});
