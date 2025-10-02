import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { writeFile, mkdir } from "fs/promises";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";

describe("Unified Component Resolution Pattern (Cross-Environment)", () => {
  let buildResult: any;

  beforeAll(async () => {
    // Use the shared build system to test unified component resolution
    buildResult = await getSharedBuild('unified-component-resolution-test-project', 'unified-component-resolution', {
      setupProject: async (testDir: string) => {
        await setupTestProject(testDir);
        
        // Create custom Root component file
        await writeFile(
          resolve(testDir, "src", "Root.tsx"),
          `
import React from "react";
import type { RootComponentType } from "vite-plugin-react-server/types";

export const Root: RootComponentType = ({ Page, pageProps = {}, as = "main", cssFiles, ...props }) => {
  return React.createElement(as as any, {
    ...props,
    "data-component-source": "string-path",
    "data-css-count": cssFiles ? cssFiles.size : 0,
    role: "main"
  }, 
    React.createElement(Page, pageProps)
  );
};
`
        );

        // Create custom Html component file
        await writeFile(
          resolve(testDir, "src", "Html.tsx"),
          `
import React from "react";
import type { HtmlComponentType } from "vite-plugin-react-server/types";

export const Html: HtmlComponentType = ({
  Root,
  cssFiles,
  globalCss,
  pageProps,
  Page,
  as = "div",
  ...props
}) => {
  return React.createElement("html", {},
    React.createElement("head", {},
      React.createElement("title", {}, "Unified Component Test")
    ),
    React.createElement("body", {},
      React.createElement(Root, {
        as,
        id: "root",
        cssFiles,
        pageProps,
        Page,
      })
    )
  );
};
`
        );
      },
      pages: ["/"],
      verbose: true,
      Root: "src/Root.tsx",
      Html: "src/Html.tsx",
    });
  });

  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it("should resolve Root component from string path", () => {
    const htmlFiles = buildResult.htmlFiles();
    
    expect(htmlFiles.length).toBeGreaterThan(0);
    
    const [, htmlContent] = htmlFiles[0];
    expect(htmlContent).toContain('data-component-source="string-path"');
    expect(htmlContent).toContain('role="main"');
  });

  it("should resolve Html component from string path", () => {
    const htmlFiles = buildResult.htmlFiles();
    
    expect(htmlFiles.length).toBeGreaterThan(0);
    
    const [, htmlContent] = htmlFiles[0];
    expect(htmlContent).toContain('<title>Unified Component Test</title>');
    expect(htmlContent).toContain('<html');
    expect(htmlContent).toContain('<body');
  });

  it("should handle CSS count in custom Root component", () => {
    const htmlFiles = buildResult.htmlFiles();
    
    expect(htmlFiles.length).toBeGreaterThan(0);
    
    const [, htmlContent] = htmlFiles[0];
    // Should have data-css-count attribute set by the custom Root component
    expect(htmlContent).toMatch(/data-css-count="\d+"/);
  });

  it("should complete build successfully with unified component resolution", () => {
    const events = buildResult.events;
    
    // Verify we have successful build events
    const buildStartEvents = events.filter((e: any) => e.type === 'build.start');
    const buildEndEvents = events.filter((e: any) => e.type.startsWith('build.writeBundle'));
    
    expect(buildStartEvents.length).toBeGreaterThan(0);
    expect(buildEndEvents.length).toBeGreaterThan(0);
    
    // Verify no error events
    const errorEvents = events.filter((e: any) => e.type === 'error');
    expect(errorEvents.length).toBe(0);
  });

  it("should generate proper server chunks with custom components", () => {
    const serverChunks = buildResult.serverChunks();
    expect(serverChunks.length).toBeGreaterThan(0);
    
    // Look for evidence of our custom components in the server build
    const hasRootComponent = serverChunks.some(([filename, content]: [string, string]) => 
      content && content.includes('data-component-source')
    );
    
    expect(hasRootComponent).toBe(true);
  });

  it("should generate proper RSC files with unified components", () => {
    const rscFiles = buildResult.rscFiles();
    
    expect(rscFiles.length).toBeGreaterThan(0);
    
    // RSC files should contain the component structure
    const [, rscContent] = rscFiles[0];
    expect(typeof rscContent).toBe('string');
    expect(rscContent.length).toBeGreaterThan(0);
  });
});
