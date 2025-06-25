import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteDoneEvent } from "../../dist/plugin/types.js";
import { doBuild } from "./doBuild.js";
import React from "react";

describe("Unified Component Resolution Pattern", () => {
  describe("String Path Resolution", () => {
    const testDir = resolve(__dirname, "../fixtures/unified-string-path.test");
    let events: PluginEvent[];
    let htmlContent: string;

    beforeAll(async () => {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      
      // Create custom Root component file
      await writeFile(
        resolve(testDir, "src", "Root.tsx"),
        `
import React from "react";
import type { RootFn } from "vite-plugin-react-server/types";

export const Root: RootFn = ({ Page, pageProps = {}, as = "main", cssFiles, ...props }) => {
  return React.createElement(as as any, {
    ...props,
    "data-component-source": "string-path",
    "data-css-count": cssFiles ? cssFiles.size : 0,
    role: "main"
  }, 
    React.createElement(Page, pageProps)
  );
};
        `.trim()
      );

      // Create custom Html component file  
      await writeFile(
        resolve(testDir, "src", "Html.tsx"),
        `
import React from "react";
import { Css, type HtmlProps } from "vite-plugin-react-server/components";

export const Html = ({ Root, cssFiles, globalCss, pageProps = {}, Page }: HtmlProps) => {
  return React.createElement("html", null,
    React.createElement("head", null,
      React.createElement(Css, { cssFiles: globalCss })
    ),
    React.createElement("body", { "data-html-source": "string-path" },
      React.createElement(Root, {
        as: "main",
        id: "root",
        cssFiles,
        Page,
        pageProps
      })
    )
  );
};
        `.trim()
      );

      events = await doBuild({
        projectRoot: testDir,
        Root: "src/Root.tsx",
        Html: "src/Html.tsx",
        build: {
          pages: ["/"], // Ensure auto-discovery runs for the root route
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
      await rm(testDir, { recursive: true, force: true });
    });

    it("should resolve Root from string path", async () => {
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('data-component-source="string-path"');
      expect(htmlContent).toContain('<main');
      expect(htmlContent).toContain('role="main"');
    });

    it("should resolve Html from string path", async () => {
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('data-html-source="string-path"');
    });

    it("should pass CSS files to string-resolved Root component", async () => {
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toMatch(/data-css-count="[1-9]\d*"/);
    });
  });

  describe("Router Function Resolution (Future Implementation)", () => {
    const testDir = resolve(__dirname, "../fixtures/unified-router.test");
    
    // NOTE: This test documents the expected behavior but will fail until types are updated
    it.skip("should resolve Root from router function", async () => {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      
      // Create custom Root component file
      await writeFile(
        resolve(testDir, "src", "shared", "AppRoot.tsx"),
        `
import React from "react";
import type { RootFn } from "vite-plugin-react-server/types";

export const Root: RootFn = ({ Page, pageProps = {}, as = "section", cssFiles, ...props }) => {
  return React.createElement(as as any, {
    ...props,
    "data-component-source": "router-function",
    "data-css-count": cssFiles ? cssFiles.size : 0,
    className: "app-root"
  }, 
    React.createElement(Page, pageProps)
  );
};
        `.trim()
      );

      const events = await doBuild({
        projectRoot: testDir,
        // Router function that returns path based on URL (not yet supported in types)
        Root: ((url: string) => url === "/" ? "src/shared/AppRoot.tsx" : "src/shared/AppRoot.tsx") as any,
      });

      const htmlEvent = events.find(
        (e) => e.type === "file.write.done" && e.data.fileType === "html"
      ) as FileWriteDoneEvent;

      const htmlContent = htmlEvent?.data?.content;
      expect(htmlContent).toContain('data-component-source="router-function"');
      expect(htmlContent).toContain('<section');
      expect(htmlContent).toContain('class="app-root"');
      
      await rm(testDir, { recursive: true, force: true });
    });
  });

  describe("Fragment Syntax Resolution", () => {
    const testDir = resolve(__dirname, "../fixtures/unified-fragment.test");
    let events: PluginEvent[];
    let htmlContent: string;

    beforeAll(async () => {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      
      // Create file with multiple exports
      await writeFile(
        resolve(testDir, "src", "components.tsx"),
        `
import React from "react";
import type { RootFn } from "vite-plugin-react-server/types";

export const MyCustomRoot: RootFn = ({ Page, pageProps = {}, as = "article", cssFiles, ...props }) => {
  return React.createElement(as as any, {
    ...props,
    "data-component-source": "fragment-syntax",
    "data-export-name": "MyCustomRoot",
    "data-css-count": cssFiles ? cssFiles.size : 0
  }, 
    React.createElement(Page, pageProps)
  );
};

export const AnotherRoot: RootFn = ({ Page, pageProps = {}, as = "aside", cssFiles, ...props }) => {
  return React.createElement(as as any, {
    ...props,
    "data-component-source": "fragment-syntax",
    "data-export-name": "AnotherRoot"
  }, 
    React.createElement(Page, pageProps)
  );
};
        `.trim()
      );

      events = await doBuild({
        projectRoot: testDir,
        Root: "src/components.tsx#MyCustomRoot", // Fragment syntax
      });

      const htmlEvent = events.find(
        (e) => e.type === "file.write.done" && e.data.fileType === "html"
      ) as FileWriteDoneEvent;

      if (htmlEvent) {
        htmlContent = htmlEvent.data.content;
      }
    });

    afterAll(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("should resolve specific export using fragment syntax", async () => {
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('data-component-source="fragment-syntax"');
      expect(htmlContent).toContain('data-export-name="MyCustomRoot"');
      expect(htmlContent).toContain('<article');
      // Should NOT contain the other export
      expect(htmlContent).not.toContain('data-export-name="AnotherRoot"');
    });
  });

  describe("Component Override (Future Implementation)", () => {
    const testDir = resolve(__dirname, "../fixtures/unified-override.test");
    
    // NOTE: This test documents the expected behavior but will fail until implemented
    it.skip("should use direct component override over path resolution", async () => {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      
      // Create file-based component
      await writeFile(
        resolve(testDir, "src", "FileRoot.tsx"),
        `
export const Root = () => <div data-source="file">File Root</div>;
        `.trim()
      );

      // Direct component override
      const DirectComponent = ({ Page, pageProps }) => 
        React.createElement("div", { "data-source": "direct" }, 
          React.createElement(Page, pageProps)
        );

      const events = await doBuild({
        projectRoot: testDir,
        Root: "src/FileRoot.tsx", // String path
        components: {
          Root: DirectComponent, // Should override the string path
        },
      } as any);

      const htmlEvent = events.find(
        (e) => e.type === "file.write.done" && e.data.fileType === "html"
      ) as FileWriteDoneEvent;

      const htmlContent = htmlEvent?.data?.content;
      
      // Should use direct component, not file-based
      expect(htmlContent).toContain('data-source="direct"');
      expect(htmlContent).not.toContain('data-source="file"');
      
      await rm(testDir, { recursive: true, force: true });
    });
  });

  describe("Export Name Configuration (Future Implementation)", () => {
    const testDir = resolve(__dirname, "../fixtures/unified-export-name.test");
    
    it.skip("should use custom export name configuration", async () => {
      await mkdir(testDir, { recursive: true });
      await setupTestProject(testDir);
      
      // Create component with custom export name
      await writeFile(
        resolve(testDir, "src", "Root.tsx"),
        `
import React from "react";
import type { RootFn } from "vite-plugin-react-server/types";

export const MySpecialRoot: RootFn = ({ Page, pageProps = {}, ...props }) => {
  return React.createElement("div", {
    ...props,
    "data-export-name": "MySpecialRoot"
  }, 
    React.createElement(Page, pageProps)
  );
};
        `.trim()
      );

      const events = await doBuild({
        projectRoot: testDir,
        Root: "src/Root.tsx",
        rootExportName: "MySpecialRoot" as any, // Custom export name (not yet supported in types)
      });

      const htmlEvent = events.find(
        (e) => e.type === "file.write.done" && e.data.fileType === "html"
      ) as FileWriteDoneEvent;

      const htmlContent = htmlEvent?.data?.content;
      expect(htmlContent).toContain('data-export-name="MySpecialRoot"');
      
      await rm(testDir, { recursive: true, force: true });
    });
  });
}); 