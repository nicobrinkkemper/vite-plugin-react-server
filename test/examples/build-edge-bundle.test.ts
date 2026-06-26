import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink, readFile } from "node:fs/promises";
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
const createEdgeHandler = (streamApi as any).createEdgeHandler as
  | typeof import("../../plugin/stream/createEdgeHandler.client.js").createEdgeHandler
  | undefined;

const testDir = resolve(__dirname, "../fixtures/build-edge-bundle.test");

async function setupFixture() {
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `export const Page = ({ name }: { name: string }) => <div id="root">Hello {name}</div>;`
  );
  // A "use server" action, imported by props so it lands in the build graph +
  // server manifest. The edge bake gates `*.server.*` modules, so the no-
  // conditions action path below dispatches through the BAKED gate.
  await writeFile(
    join(testDir, "src/page/actions.server.ts"),
    `"use server";\nexport async function bump(n: number) { return n + 1; }`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `import { bump } from "./actions.server.js";\n` +
      `export const props = (_url: string) => ({ name: "edge-isolate", bump });`
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
          edge: true,
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

    it("serves rendered HTML with a hydration bootstrap via createEdgeHandler", async () => {
      const { renderRouteToFlight } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );

      // Derive the bootstrap entry from the client manifest, exactly as a real
      // edge adapter would (so the served HTML can hydrate).
      const clientManifest = JSON.parse(
        await readFile(
          join(testDir, "dist/client/.vite/manifest.json"),
          "utf8"
        )
      );
      const clientEntry = clientManifest["src/client.tsx"]?.file as string;
      expect(clientEntry).toBeTruthy();

      const handler = createEdgeHandler!({
        render: renderRouteToFlight,
        moduleBaseURL: "/",
        bootstrapModules: ["/" + clientEntry],
      });

      const response = await handler(new Request("http://edge.test/"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("edge-isolate");
      // The bootstrap entry must be wired into the HTML for hydration.
      expect(html).toContain(clientEntry);
    });

    it("renders a flash-free inline-flight document via renderDocument mode", async () => {
      const { renderRouteToDocument } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const clientManifest = JSON.parse(
        await readFile(join(testDir, "dist/client/.vite/manifest.json"), "utf8")
      );
      const clientEntry = clientManifest["src/client.tsx"]?.file as string;

      const handler = createEdgeHandler!({
        renderDocument: (url: string) => renderRouteToDocument(url),
        moduleBaseURL: "/",
        bootstrapModules: ["/" + clientEntry],
      });

      const response = await handler(new Request("http://edge.test/"));
      expect(response.status).toBe(200);
      const html = await response.text();
      // A full document, the live content, the inline flight (zero-refetch
      // hydration), and the bootstrap entry.
      expect(html).toContain("<html");
      expect(html).toContain("edge-isolate");
      expect(html).toContain('id="vprs-flight"');
      expect(html).toContain(clientEntry);
    });

    it("returns 404 for a route the bundle was not baked with", async () => {
      const { renderRouteToFlight } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const handler = createEdgeHandler!({ render: renderRouteToFlight });
      const response = await handler(new Request("http://edge.test/missing"));
      expect(response.status).toBe(404);
    });

    // Regression guard for the no-`--conditions` crash class: a server action
    // must dispatch through the bundle's BAKED gate without the process pulling
    // the on-disk react-server transport (which asserts the condition). This test
    // runs under the default condition (the suite skips the react-server leg), so
    // importing the gate and executing the action here proves the no-conditions
    // edge-server path is import-safe AND functional end to end.
    it("dispatches a server action through the baked gate with no --conditions", async () => {
      const { handleRouteAction } = await import(
        pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
      );
      const request = new Request("http://edge.test/", {
        method: "POST",
        headers: {
          "x-rsc-action": "src/page/actions.server.ts#bump",
          "content-type": "application/json",
        },
        // Body is a bare JSON args array (the id rides in the header).
        body: JSON.stringify([41]),
      });
      const response = await handleRouteAction(request, { projectRoot: testDir });
      expect(response.status).toBe(200);
      // RSC success wire format `0:<json>` — bump(41) ran through the gate → 42.
      expect(await response.text()).toContain("0:42");
    });
  }
);
