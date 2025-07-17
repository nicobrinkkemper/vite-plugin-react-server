import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteDoneEvent } from "../../dist/plugin/types.js";
import { doBuild } from "./doBuild.js";

describe("Custom Root Component - Function Path", () => {
  const testDir = resolve(__dirname, "../fixtures/custom-root-function.test");
  let events: PluginEvent[];
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
    "data-function-root": "true",
    "data-css-files": cssCount.toString(),
    role: "main"
  }, 
    React.createElement(Page, pageProps)
  );
};
      `.trim()
    );

    events = await doBuild({
      projectRoot: testDir,
      Root: (url: string) => `src/CustomRoot.tsx`, // Function that returns string path
    });

    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent;

    if (htmlEvent) {
      htmlContent = htmlEvent.data.content;
    }
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("should load Root component from function path", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('data-function-root="true"');
  });

  it("should use custom element type from function Root", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('<main');
    expect(htmlContent).toContain('role="main"');
  });

  it("should receive CSS files in function Root component", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toMatch(/data-css-files="[1-9]\d*"/);
  });
}); 