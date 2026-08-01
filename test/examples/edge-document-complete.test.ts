import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as streamApi from "vite-plugin-react-server/stream";
import { fileRouter } from "../../plugin/router/fileRouter.js";
import { doBuild } from "../doBuild.js";

// renderFlightToHtml / createEdgeHandler are client-only (default condition), so
// this suite runs on the client leg of test-both — same guard the other
// single-isolate edge tests use. The edge bake itself runs during the build.
const createEdgeHandler = (streamApi as any).createEdgeHandler as
  | typeof import("../../plugin/stream/createEdgeHandler.client.js").createEdgeHandler
  | undefined;

const testDir = resolve(__dirname, "../fixtures/edge-document-complete.test");

// A minimal "starter"-shaped edge app: one route whose loader reads geo off the
// request, a stylesheet the client entry imports, and inline flight enabled.
// This is the exact shape whose end-to-end behavior kept regressing when only
// unit-level signals were checked — so it's asserted here as one contract.
async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  // A CSS module imported by the page (a server component) — the case that
  // lands in the static manifest, which is what buildEdgeBundle reads to bake
  // the document's default globalCss.
  await writeFile(
    join(testDir, "src/routes/styles.module.css"),
    `.box { color: rgb(1, 2, 3); }`
  );
  await writeFile(join(testDir, "src/client.tsx"), `export {};`);
  // Loader reads the visitor geo off the request — present only on the
  // per-request edge render (undefined at prerender).
  await writeFile(
    join(testDir, "src/routes/props.ts"),
    `export const props = (_url: string, { request }: { request?: Request }) => ({\n` +
      `  region: request?.headers.get("x-geo-region") ?? "none",\n});`
  );
  // Server page renders the geo directly — so on the edge it's in the server
  // HTML on first paint, with no client fetch.
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import React from "react";\n` +
      `import styles from "./styles.module.css";\n` +
      `export const Page = ({ region }: { region: string }) => (\n` +
      // Single expression → one text node, so SSR doesn't split it with a
      // comment marker (which would defeat a substring assertion).
      `  <div id="root" className={styles.box}>{"edge-region-" + region}</div>\n);`
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head></head><body><div id="root"></div>` +
      `<script type="module" src="/src/client.tsx"></script></body></html>`
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

describe.skipIf(!createEdgeHandler)("edge document — complete render contract", () => {
  let html = "";
  let bundleSource = "";

  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupFixture();
    const fr = fileRouter(join(testDir, "src/routes"), { root: testDir });
    await doBuild({
      projectRoot: testDir,
      moduleBase: "src",
      Page: fr.Page,
      props: fr.props,
      routePatterns: fr.routePatterns,
      build: {
        pages: fr.build.pages,
        outDir: "dist",
        edge: true,
        // Inline the initial flight → the client hydrates in place with no
        // /index.rsc round-trip.
        inlineFlight: true,
      },
    } as any);

    bundleSource = readFileSync(
      join(testDir, "dist/server-edge/render.js"),
      "utf8"
    );

    // Render the route ON THE EDGE via the real handler, with a geo request —
    // exactly what a Vercel edge function does per request.
    const { renderRouteToDocument } = await import(
      pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
    );
    const handler = createEdgeHandler!({
      renderDocument: renderRouteToDocument,
      moduleBaseURL: pathToFileURL(join(testDir, "dist/client")).href + "/",
    });
    const res = await handler(
      new Request("http://edge.test/", {
        headers: { "x-geo-region": "ams1" },
      })
    );
    html = await res.text();
  }, 120000);

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("bakes the single-isolate edge bundle", () => {
    expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(true);
  });

  it("renders the request's geo into the server HTML (no client fetch)", () => {
    // The loader read x-geo-region off the request during the edge render, so
    // the value is in the first-paint HTML — not fetched by the client after.
    expect(html).toContain("edge-region-ams1");
  });

  it("carries the built stylesheets in the document (styled first paint)", () => {
    // Regression guard for the edge CSS gap: the Html component renders
    // globalCss (baked from the static manifest by buildEdgeBundle) as a
    // precedence-hoisted <link>. Before that, the edge render shipped UNSTYLED.
    expect(html).toMatch(
      /<link[^>]+rel="stylesheet"[^>]+href="[^"]+\.css"/
    );
  });

  it("inlines the initial flight (no /index.rsc round-trip)", () => {
    expect(html).toContain("vprs-flight");
  });

  it("bakes the PRODUCTION react-server-dom transport (client-decodable flight)", () => {
    // Regression guard for the dev/prod gap: the vendored transport branches on
    // process.env.NODE_ENV at runtime, emitting dev-only flight-timeline debug
    // chunks. A dev flight makes the production browser client throw "Failed to
    // read a RSC payload created by a development version of React", so
    // hydration silently falls back to static. buildEdgeBundle now defines
    // NODE_ENV=production at bake time, dead-code-eliminating those branches —
    // assert none of the dev-only transport code survived in the bundle.
    expect(bundleSource).not.toContain("completedDebugChunks");
    expect(bundleSource).not.toContain("emitTimeOriginChunk");
    expect(bundleSource).not.toMatch(/process\.env\.NODE_ENV/);
  });
});
