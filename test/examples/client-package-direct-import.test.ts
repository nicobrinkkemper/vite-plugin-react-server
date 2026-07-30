import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { mkdir, writeFile } from "fs/promises";
import { setupIndexHTML } from "../setup.js";
import { getSharedBuild, SharedBuildResult } from "./shared-build.js";

/**
 * A server component may import a component from a client package directly —
 * no user-authored `"use client"` wrapper. The package ships per-file
 * `"use client"` directives in its compiled output (the shape Chakra UI, MUI,
 * Mantine, react-aria, and framer-motion publish); listing it in
 * `clientPackages` (or auto-detection via its react peerDep) keeps those
 * directives visible to the transformer, which converts each directive module
 * into a client reference instead of executing it under the `react-server`
 * condition.
 *
 * The local package below recreates the installed-dependency shape: an ESM
 * module under the fixture's `node_modules` whose top line is `"use client"`
 * and whose body calls a client-only React API (`useState`). Executing it
 * server-side would throw `react does not provide an export named 'useState'`;
 * hosting it as a client reference must not.
 */
describe("Client package imported directly by a server component", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild(
      "client-package-direct-import",
      "client-package-direct-import",
      {
        setupProject: async (testDir: string) => {
          await setupIndexHTML(testDir);
          await mkdir(resolve(testDir, "src/page"), { recursive: true });

          const pkg = resolve(testDir, "node_modules", "fake-ui");
          await mkdir(pkg, { recursive: true });
          await writeFile(
            resolve(pkg, "package.json"),
            JSON.stringify({
              name: "fake-ui",
              version: "1.0.0",
              type: "module",
              main: "index.js",
              exports: { ".": "./index.js" },
              peerDependencies: { react: "*" },
            })
          );
          await writeFile(
            resolve(pkg, "index.js"),
            `"use client";
import React from "react";

export function FancyButton({ label }) {
  const [count, setCount] = React.useState(0);
  return React.createElement(
    "button",
    { "data-testid": "fancy-button", onClick: () => setCount(count + 1) },
    label,
    " ",
    count
  );
}
`
          );

          // First-party client module importing the package: this is what
          // pulls fake-ui into the CLIENT build graph so its directive module
          // is emitted (hosted) under dist/*/node_modules/fake-ui/. Without
          // any client-side importer the server-recorded reference dangles at
          // SSG render (ERR_MODULE_NOT_FOUND).
          await mkdir(resolve(testDir, "src/components"), { recursive: true });
          await writeFile(
            resolve(testDir, "src/components/Toolbar.client.tsx"),
            `import React from "react";
import { FancyButton } from "fake-ui";

export function Toolbar() {
  return <FancyButton label="toolbar" />;
}
`
          );

          await writeFile(
            resolve(testDir, "src/page/page.tsx"),
            `import React from "react";
import { FancyButton } from "fake-ui";
import { Toolbar } from "../components/Toolbar.client.js";

export function Page() {
  return (
    <div>
      <h1>Client Package Test</h1>
      <Toolbar />
      <FancyButton label="press" />
    </div>
  );
}
`
          );

          await writeFile(
            resolve(testDir, "src/page/props.ts"),
            `export const props = (url: string) => ({ url });`
          );
        },
        pages: ["/"],
        // Surface any RSC serialization error as a build failure so the test
        // fails loudly if direct import regresses.
        panicThreshold: "all_errors",
        verbose: false,
        clientPackages: ["fake-ui"],
      }
    );
  }, 30000);

  it("builds without executing the client package under react-server", () => {
    expect(buildResult).toBeDefined();
    const routeErrors = buildResult.events.filter(
      (e: any) => e.type === "route.error"
    );
    expect(routeErrors).toHaveLength(0);
  });

  it("renders the server shell around the client component slot", () => {
    const htmlFiles = buildResult.htmlFiles();
    expect(htmlFiles.length).toBeGreaterThan(0);
    expect(htmlFiles[0][1]).toContain("Client Package Test");
  });

  it("serializes the package component as a hosted client reference", () => {
    const rscContent = buildResult
      .rscFiles()
      .map(([, content]) => content)
      .join("\n");
    expect(rscContent).toMatch(/I\[/);
    expect(rscContent).toContain("FancyButton");
  });

  it("emits the package's directive module as a client chunk", () => {
    const clientLike = [
      ...buildResult.clientChunks(),
      ...buildResult.staticChunks(),
    ];
    expect(
      clientLike.some(([, code]) => /FancyButton/.test(code))
    ).toBe(true);
  });
});

describe("Client package with no client-side importer", () => {
  it("dangles at SSG render: the reference's module is never hosted", async () => {
    // Same package, but ONLY a server component imports it — nothing pulls
    // fake-ui into the client graph, so the client build never emits
    // node_modules/fake-ui/index.js and the html-worker's import of the
    // client reference fails. This pins the reachability rule the docs state;
    // if hosting ever becomes reference-driven for third-party packages
    // (as it already is for vprs's own router barrel), this expectation
    // should flip.
    await expect(
      getSharedBuild(
        "client-package-dangling-reference",
        "client-package-dangling-reference",
        {
          setupProject: async (testDir: string) => {
            await setupIndexHTML(testDir);
            await mkdir(resolve(testDir, "src/page"), { recursive: true });

            const pkg = resolve(testDir, "node_modules", "fake-ui");
            await mkdir(pkg, { recursive: true });
            await writeFile(
              resolve(pkg, "package.json"),
              JSON.stringify({
                name: "fake-ui",
                version: "1.0.0",
                type: "module",
                main: "index.js",
                exports: { ".": "./index.js" },
                peerDependencies: { react: "*" },
              })
            );
            await writeFile(
              resolve(pkg, "index.js"),
              `"use client";
import React from "react";

export function FancyButton({ label }) {
  const [count, setCount] = React.useState(0);
  return React.createElement(
    "button",
    { onClick: () => setCount(count + 1) },
    label,
    " ",
    count
  );
}
`
            );

            await writeFile(
              resolve(testDir, "src/page/page.tsx"),
              `import React from "react";
import { FancyButton } from "fake-ui";

export function Page() {
  return (
    <div>
      <h1>Dangling Reference Test</h1>
      <FancyButton label="press" />
    </div>
  );
}
`
            );

            await writeFile(
              resolve(testDir, "src/page/props.ts"),
              `export const props = (url: string) => ({ url });`
            );
          },
          pages: ["/"],
          panicThreshold: "all_errors",
          verbose: false,
          clientPackages: ["fake-ui"],
        }
      )
    ).rejects.toThrow(/fake-ui/);
  }, 30000);
});
