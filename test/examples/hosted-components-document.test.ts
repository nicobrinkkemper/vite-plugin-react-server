import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { mkdir, writeFile } from "fs/promises";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";

/**
 * A document wrapper may import components from a package — the plugin's own
 * `Css`/`Root` from `vite-plugin-react-server/components`, or any third-party
 * component. The server build inlines such a package and Rollup emits its
 * modules under `dist/server/node_modules/<pkg>/`, a directory with no
 * package.json of its own.
 *
 * That shape used to break the SSG render: the RSC worker registered tsx even
 * in build mode, and tsx's package-type lookup stops at the nearest
 * `node_modules` boundary — so it read those emitted chunks as CJS, their ESM
 * named exports vanished at link time ("does not provide an export named
 * 'Css'"), loading the document wrapper failed, and the worker silently fell
 * back to React.Fragment. Every route then shipped without <html>/<head>/<body>.
 * Node's own resolution walks past that boundary to the project's package.json
 * and loads them as ESM, so the worker no longer registers tsx in build mode.
 *
 * The repo's own fixtures resolve `vite-plugin-react-server` by package
 * self-reference (emitting to `dist/server/dist/plugin/...`, no `node_modules`
 * segment), which is why only installed consumers ever hit this. The local
 * package below recreates the installed-dependency shape that does.
 */
describe("Document wrapper importing package components", () => {
  let buildResult: any;

  beforeAll(async () => {
    buildResult = await getSharedBuild(
      "hosted-components-document",
      "hosted-components-document",
      {
        setupProject: async (testDir: string) => {
          await setupTestProject(testDir);

          // A dependency resolved through node_modules, so the server build
          // emits it under dist/server/node_modules/doc-kit/ — the shape that
          // regressed. ESM, named export, no default.
          const docKit = resolve(testDir, "node_modules", "doc-kit");
          await mkdir(docKit, { recursive: true });
          await writeFile(
            resolve(docKit, "package.json"),
            JSON.stringify({
              name: "doc-kit",
              version: "1.0.0",
              type: "module",
              main: "index.js",
              exports: { ".": "./index.js" },
            })
          );
          await writeFile(
            resolve(docKit, "index.js"),
            `
import React from "react";
export const Meta = ({ title }) =>
  React.createElement("meta", { name: "generator", content: title });
`
          );

          await writeFile(
            resolve(testDir, "src", "Html.tsx"),
            `
import React from "react";
import { Css, Root as DefaultRoot } from "vite-plugin-react-server/components";
import { Meta } from "doc-kit";
import type { HtmlComponentType } from "vite-plugin-react-server/types";

export const Html: HtmlComponentType = ({
  Root = DefaultRoot,
  cssFiles,
  globalCss,
  pageProps,
  Page,
  as = "div",
}) => {
  return React.createElement("html", { "data-hosted-document": "true" },
    React.createElement("head", {},
      React.createElement("title", {}, "Hosted Components Document"),
      React.createElement(Meta, { title: "doc-kit" }),
      React.createElement(Css, { cssFiles: globalCss })
    ),
    React.createElement("body", {},
      React.createElement(Root as React.ElementType, {
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
        verbose: false,
        Html: "src/Html.tsx",
        // Inlines doc-kit into the server build, exactly as the plugin does to
        // itself (it auto-discovers as a client package — it ships "use client"
        // router modules). That is what makes Rollup emit it under
        // dist/server/node_modules/doc-kit/ with no package.json of its own.
        clientPackages: ["doc-kit"],
      }
    );
  });

  it("renders a full document, not a headless fragment", () => {
    const htmlFiles = buildResult.htmlFiles();
    expect(htmlFiles.length).toBeGreaterThan(0);

    const [, htmlContent] = htmlFiles[0];
    expect(htmlContent).toMatch(/^\s*(<!DOCTYPE html>)?\s*<html/i);
    expect(htmlContent).toContain('<html data-hosted-document="true"');
    expect(htmlContent).toContain("<head>");
    expect(htmlContent).toContain("<body>");
    expect(htmlContent).toContain("<title>Hosted Components Document</title>");
  });

  it("keeps the named exports of a package emitted under dist/server/node_modules", () => {
    const [, htmlContent] = buildResult.htmlFiles()[0];
    // Rendered by doc-kit's `Meta`, whose named export is what tsx's CJS
    // misclassification used to drop.
    expect(htmlContent).toContain('<meta name="generator" content="doc-kit"');
  });

  it("mounts the page through the plugin's own hosted Root", () => {
    const [, htmlContent] = buildResult.htmlFiles()[0];
    expect(htmlContent).toContain('id="root"');
  });
});
