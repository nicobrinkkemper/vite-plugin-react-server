import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteDoneEvent, RootComponentType } from "vite-plugin-react-server/types";
import { doBuild } from "./doBuild.js";
import React from "react";

describe("Custom Root Component", () => {
  const testDir = resolve(__dirname, "../fixtures/custom-root.test");
  let events: PluginEvent[];
  let htmlContent: string;

  // Custom Root component for testing
  const TestRoot: RootComponentType = ({ Page, pageProps = {}, as = "div", cssFiles, ...props }) => {
    const cssCount = cssFiles ? cssFiles.size : 0;
    return React.createElement(as as any, { 
      ...props, 
      "data-test-root": "true",
      "data-css-count": cssCount.toString()
    }, 
      React.createElement(Page, pageProps)
    );
  };

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    
    events = await doBuild({
      projectRoot: testDir,
      components: {
        Root: TestRoot,
      },
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

  it("should use custom Root component", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('data-test-root="true"');
  });

  it("should receive CSS files in Root component", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toMatch(/data-css-count="[1-9]\d*"/);
  });

  it("should render with custom element type", async () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('<div');
    expect(htmlContent).toContain('data-test-root="true"');
  });
});