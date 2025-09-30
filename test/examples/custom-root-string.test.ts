import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { rm, writeFile } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteDoneEvent, RenderMetrics, WorkerStartupMetrics, ModuleResolutionMetrics } from "../../dist/plugin/types.js";
import { doBuild } from "../doBuild.js";

describe("Custom Root Component - String Path", () => {
  const testDir = resolve(__dirname, "../fixtures/custom-root-string.test");
  let buildInfo: {events: PluginEvent[]; metrics: (RenderMetrics | WorkerStartupMetrics | ModuleResolutionMetrics)[]};
  let htmlContent: string;

  beforeAll(async () => {
    await setupTestProject(testDir);
    
    // Create custom Root component file
    await writeFile(
      resolve(testDir, "src", "CustomRoot.tsx"),
      `
import React from "react";
import type { RootComponentType } from "vite-plugin-react-server/types";

export const Root: RootComponentType = ({ Page, pageProps = {}, as: As = React.Fragment, cssFiles, ...props }) => {
  const cssCount = cssFiles ? cssFiles.size : 0;
  
  // For headless stream, use React.Fragment
  if (As === React.Fragment) {
    return React.createElement(React.Fragment, {}, 
      React.createElement(Page, pageProps)
    );
  }
  
  // For normal HTML stream, always render as 'main' regardless of what was passed
  return React.createElement('main', { 
    ...props, 
    "data-string-root": "true",
    "data-css-files": cssCount.toString(),
    role: "main"
  }, 
    React.createElement(Page, pageProps)
  );
};
      `.trim()
    );

    buildInfo = await doBuild({
      projectRoot: testDir,
      verbose: false,
      Root: "src/CustomRoot.tsx", // String path reference
    });

    const htmlEvent = buildInfo.events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent;

    if (htmlEvent) {
      htmlContent = htmlEvent.data.content;
    } else {
      
      throw buildInfo.events;
    }
  });

  afterAll(async () => {
    try {
     // await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("should load Root component from string path", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('data-string-root="true"');
  });

  it("should use custom element type from string Root", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('<main');
    expect(htmlContent).toContain('role="main"');
  });

  it("should receive CSS files in string Root component", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toMatch(/data-css-files="[1-9]\d*"/);
  });
}); 