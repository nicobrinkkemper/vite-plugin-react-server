import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as streamApi from "vite-plugin-react-server/stream";
import { doBuild } from "../doBuild.js";

// renderFlightToHtml is client-only (exported under the default condition, not
// react-server), so the whole suite skips on the react-server leg of test-both
// — same guard the other single-isolate stream tests use. We still run the
// build under the client condition, which is enough to exercise the edge bake.
const renderFlightToHtml = (streamApi as any).renderFlightToHtml as
  | typeof import("../../plugin/stream/renderFlightToHtml.client.js").renderFlightToHtml
  | undefined;

const testDir = resolve(__dirname, "../fixtures/build-edge-bundle.test");

async function setupFixture() {
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `export const Page = ({ name }: { name: string }) => <div id="root">Hello {name}</div>;`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = (_url: string) => ({ name: "edge-isolate" });`
  );
  await writeFile(
    join(testDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    })
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `import { use, useState } from "react";
import { createRoot } from "react-dom/client";
import { createReactFetcher } from "vite-plugin-react-server/utils";
const Shell = ({ data }: { data: any }) => <>{use(useState(data)[0])}</>;
createRoot(document.getElementById("root")!).render(<Shell data={createReactFetcher()} />);`
  );
  // Resolve vite-plugin-react-server / react from the repo's node_modules.
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir"
    );
  } catch {}
}

describe.skipIf(!renderFlightToHtml)(
  "build.edge single-isolate bake",
  () => {
    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();
      await doBuild({
        projectRoot: testDir,
        moduleBase: "src",
        Page: "src/page/page.tsx",
        props: "src/page/props.ts",
        build: {
          pages: ["/"],
          outDir: "dist",
          edge: { singleIsolate: true },
        },
      } as any);
    });

    afterAll(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("emits a baked rsc bundle to dist/server-edge", () => {
      expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(true);
    });

    it("keeps the default worker-based server build (additive)", () => {
      // The normal dist/server output is untouched and still externalizes React.
      expect(existsSync(join(testDir, "dist/server/page/page.js"))).toBe(true);
    });

    it("renders the baked bundle to HTML in one process via renderFlightToHtml", async () => {
      const { renderRouteToFlight } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const html = await new Response(
        await renderFlightToHtml!({
          rscStream: await renderRouteToFlight("/"),
          moduleBaseURL: "/",
        })
      ).text();
      expect(html).toContain("edge-isolate");
      expect(html).toContain('id="root"');
      expect(html).not.toContain("Switched to client rendering");
    });
  }
);
