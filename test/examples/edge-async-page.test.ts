import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as streamApi from "vite-plugin-react-server/stream";
import { doBuild } from "../doBuild.js";

// UrlOpt resolvers may be ASYNC (Promise<string>). The esm SSG path awaits
// them; the edge bake must too — before the fix it saw a Promise where it
// expected a string, omitted EVERY route ("could not resolve built
// Page/props"), skipped the pair, and under transport webpack the freeze then
// failed the whole build. Net: webpack transport (and the edge runner with
// it) was incompatible with async resolvers.
const renderFlightToHtml = (streamApi as any).renderFlightToHtml as
  | typeof import("../../plugin/stream/renderFlightToHtml.client.js").renderFlightToHtml
  | undefined;

const testDir = resolve(__dirname, "../fixtures/edge-async-page.test");

async function setupFixture() {
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `export const Page = ({ name }: { name: string }) => <div id="root">Hello {name}</div>;`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = (_url: string) => ({ name: "async-resolved" });`
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `"use client";\nexport const noop = true;`
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
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir"
    );
  } catch {}
}

describe.skipIf(!renderFlightToHtml)(
  "edge bake with async Page/props resolvers",
  () => {
    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();
      await doBuild({
        projectRoot: testDir,
        moduleBase: "src",
        // ASYNC resolvers — the shape the bake used to drop on the floor.
        Page: async (_url: string) => "src/page/page.tsx",
        props: async (_url: string) => "src/page/props.ts",
        transport: "webpack",
        build: {
          pages: ["/"],
          outDir: "dist",
          edge: true,
        },
      } as any);
    }, 240000);

    afterAll(async () => {
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("emits the pair instead of omitting every route", () => {
      expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(
        true
      );
      expect(existsSync(join(testDir, "dist/server-edge/consumer.js"))).toBe(
        true
      );
    });

    it("renders the async-resolved route through the baked pair", async () => {
      const { renderRouteToFlight } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const { renderFlightToHtml: consume } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/consumer.js")).href
      );
      const html = await new Response(
        await consume({ rscStream: await renderRouteToFlight("/") })
      ).text();
      expect(html).toContain("Hello ");
      expect(html).toContain("async-resolved");
    });
  }
);
