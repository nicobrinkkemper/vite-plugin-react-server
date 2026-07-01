import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as streamApi from "vite-plugin-react-server/stream";
import { fileRouter } from "../../plugin/router/fileRouter.js";
import { doBuild } from "../doBuild.js";

// renderFlightToHtml is client-only (default condition), so this suite runs on
// the client leg of test-both — same guard the other single-isolate edge tests
// use. The edge bake itself runs during the build regardless.
const renderFlightToHtml = (streamApi as any).renderFlightToHtml as
  | typeof import("../../plugin/stream/renderFlightToHtml.client.js").renderFlightToHtml
  | undefined;

const testDir = resolve(__dirname, "../fixtures/build-edge-router.test");

async function setupFixture() {
  await mkdir(join(testDir, "src/routes/profile/$id"), { recursive: true });
  // Dynamic route whose loader reads engine-supplied params — the thing the
  // edge bundle must thread via ROUTE_PATTERNS.
  await writeFile(
    join(testDir, "src/routes/profile/$id/page.tsx"),
    `export const Page = ({ label }: { label: string }) => <div id="root">edge {label}</div>;`
  );
  await writeFile(
    join(testDir, "src/routes/profile/$id/props.ts"),
    `export const props = (_url: string, { params }: { params: { id: string } }) => ({\n` +
      `  label: "pid-" + params.id + "-end",\n});`
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
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir"
    );
  } catch {
    /* already linked */
  }
}

describe.skipIf(!renderFlightToHtml)("build.edge + file router (params)", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupFixture();
    const fr = fileRouter(join(testDir, "src/routes"), {
      root: testDir,
      // Enumerate the concrete dynamic path so the edge bundle bakes it.
      staticPaths: { "/profile/$id": () => [{ id: "42" }] },
    });
    await doBuild({
      projectRoot: testDir,
      moduleBase: "src",
      Page: fr.Page,
      props: fr.props,
      routePatterns: fr.routePatterns,
      build: { pages: fr.build.pages, outDir: "dist", edge: true },
    } as any);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("bakes the enumerated dynamic route into the edge bundle", () => {
    expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(true);
  });

  it("threads the matched param into the loader on the edge render path", async () => {
    const { renderRouteToFlight } = await import(
      pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
    );
    const html = await new Response(
      await renderFlightToHtml!({
        rscStream: await renderRouteToFlight("/profile/42"),
        moduleBaseURL: "/",
      })
    ).text();
    // params.id === "42" reached the loader → label rendered by the edge bundle.
    expect(html).toContain("pid-42-end");
    expect(html).not.toContain("Switched to client rendering");
  });
});
