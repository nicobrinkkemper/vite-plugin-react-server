import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "path";
import { rm, writeFile } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type { PluginEvent, FileWriteDoneEvent } from "../../dist/plugin/types.js";
import { doBuild } from "./doBuild.js";

const testDir = resolve(__dirname, "../fixtures/unified-component-resolution.test");

describe("Unified Component Resolution Pattern", () => {
  let events: PluginEvent[];
  let htmlContent: string | undefined;

  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupTestProject(testDir);
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
      `.trim()
    );
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
        pages: ["/"],
      },
    });
    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent;
    htmlContent = htmlEvent?.data?.content;
  }, 30000);

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("should resolve Root and Html from string path", () => {
    expect(htmlContent).toBeDefined();
    expect(htmlContent).toContain('data-component-source="string-path"');
    expect(htmlContent).toContain('<main');
    expect(htmlContent).toContain('role="main"');
    expect(htmlContent).toContain('data-html-source="string-path"');
    expect(htmlContent).toMatch(/data-css-count="[1-9]\d*"/);
  });
}); 