import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";

describe("Plugin Inline Css Event hooks", () => {
  let buildResult: any;
  let htmlContent: string;
  let rscContent: string;

  beforeAll(async () => {
    buildResult = await getSharedBuild('test-project', 'inline-css', {
      setupProject: setupTestProject,
      pages: ['/'],
      css: {
        inlineCss: true,
        inlineThreshold: 0,
      }
    });

    // Get HTML content using the new API
    const htmlFiles = buildResult.htmlFiles();
    if (htmlFiles.length > 0) {
      htmlContent = htmlFiles[0][1]; // Get content from first HTML file
    }

    // Get RSC content using the new API
    const rscFiles = buildResult.rscFiles();
    if (rscFiles.length > 0) {
      rscContent = rscFiles[0][1]; // Get content from first RSC file
    }
  });
  
  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it("emits file.write events for html and rsc files", async () => {
    const fileWriteEvents = buildResult.events.filter((e: any) => e.type === "file.write.done");
    expect(fileWriteEvents.length).toBeGreaterThanOrEqual(2);
    if(!fileWriteEvents.length) {
      throw buildResult.events;
    }
    
    // Find HTML and RSC file write events
    const htmlEvent = fileWriteEvents.find((e: any) => e.data.fileType === "html");
    const rscEvent = fileWriteEvents.find((e: any) => e.data.fileType === "rsc");
    
    expect(htmlEvent).toBeDefined();
    expect(rscEvent).toBeDefined();
    if (htmlEvent && rscEvent) {
      // Verify HTML content
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain("</style>");
      
      // Verify RSC content
      expect(rscContent).toBeTruthy();
      // console.log(rscContent);
    }
  });
});
