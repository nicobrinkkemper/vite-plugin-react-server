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
const createEdgeHandler = (streamApi as any).createEdgeHandler as
  | typeof import("../../plugin/stream/createEdgeHandler.client.js").createEdgeHandler
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
  // An authenticated route: NOT prerendered (no getStaticPaths entry), so it
  // renders per-request; the loader reads the request to gate on identity.
  await mkdir(join(testDir, "src/routes/secret/$id"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/secret/$id/page.tsx"),
    `export const Page = ({ who }: { who: string }) => <div id="root">{who}</div>;`
  );
  await writeFile(
    join(testDir, "src/routes/secret/$id/props.ts"),
    `export const props = (\n` +
      `  _url: string,\n` +
      `  { request }: { request?: Request }\n` +
      `) => ({ who: "secret-for-" + (request?.headers.get("x-user") ?? "anon") });`
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

  async function renderEdge(url: string, request?: Request): Promise<string> {
    const { renderRouteToFlight } = await import(
      pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
    );
    return new Response(
      await renderFlightToHtml!({
        rscStream: await renderRouteToFlight(url, request),
        moduleBaseURL: "/",
      })
    ).text();
  }

  it("threads the matched param into the loader for an enumerated route", async () => {
    const html = await renderEdge("/profile/42");
    // params.id === "42" reached the loader → label rendered by the edge bundle.
    expect(html).toContain("pid-42-end");
    expect(html).not.toContain("Switched to client rendering");
  });

  it("renders an UNENUMERATED dynamic url per-request (pattern match)", async () => {
    // /profile/999 was NOT in getStaticPaths, so it's not in the enumerated
    // routes — the edge must match it to /profile/$id and render per-request.
    const html = await renderEdge("/profile/999");
    expect(html).toContain("pid-999-end");
    expect(html).not.toContain("Switched to client rendering");
  });

  it("threads the request into an edge loader (authenticated route)", async () => {
    // The loader gates on the request's identity header — proving an edge route
    // can authenticate per-request, not just read params.
    const authed = await renderEdge(
      "/secret/9",
      new Request("http://edge.test/secret/9", {
        headers: { "x-user": "alice" },
      })
    );
    expect(authed).toContain("secret-for-alice");
    // No request (e.g. prerender) → the loader sees no identity.
    const anon = await renderEdge("/secret/9");
    expect(anon).toContain("secret-for-anon");
  });

  it("supports per-route cache headers so auth routes aren't CDN-cached", async () => {
    const { renderRouteToFlight } = await import(
      pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
    );
    const handler = createEdgeHandler!({
      render: renderRouteToFlight,
      moduleBaseURL: "/",
      // Cache the prerendered set; never cache an authenticated route.
      headers: (url) =>
        url.startsWith("/secret/")
          ? { "cache-control": "private, no-store" }
          : { "cache-control": "public, max-age=3600" },
    });
    const secret = await handler(new Request("http://edge.test/secret/9"));
    expect(secret.headers.get("cache-control")).toBe("private, no-store");
    const pub = await handler(new Request("http://edge.test/profile/42"));
    expect(pub.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});
