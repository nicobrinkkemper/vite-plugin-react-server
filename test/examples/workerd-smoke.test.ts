import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { doBuild } from "../doBuild.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

/**
 * The webpack bake pair on REAL workerd — the platform the edge bundle exists
 * for. The edge-bundle guard asserts no statically-evaluated node builtin by
 * analysis; this suite proves the runtime claims by execution, in one isolate
 * with NO nodejs_compat:
 *
 *   - both bundles evaluate clean at boot,
 *   - `renderRouteToFlight` renders a webpack-flavored payload in-isolate
 *     (client-reference rows against the baked registry),
 *   - the consumer's `renderFlightToHtml` decodes and renders that flight to
 *     HTML in the SAME isolate — server React and client React graphs
 *     coexisting — resolving client references through the closed registry,
 *   - `handleRouteAction` round-trips a server action on-platform
 *     (encode → sealed gate → execute → respond), and rejects a malformed id
 *     LOUDLY, not silently.
 *
 * workerd is provided by miniflare, which is deliberately NOT a dependency of
 * this repo: the suite skips when it is not installed, and CI installs it with
 * `npm i --no-save miniflare@4` for the dedicated smoke job. Pin @4 — the
 * `latest` tag resolves to a 5.x alpha with a changed constructor schema.
 */

// Resolved via a variable so TypeScript does not require the package's types
// when it is not installed.
const MINIFLARE = "miniflare";
let Miniflare: (new (options: unknown) => {
  dispatchFetch(url: string, init?: RequestInit): Promise<Response>;
  dispose(): Promise<void>;
}) | undefined;
try {
  ({ Miniflare } = await import(/* @vite-ignore */ MINIFLARE));
} catch (error) {
  // Fail-open is only acceptable where miniflare is legitimately absent
  // (local runs). The dedicated CI job sets VPRS_REQUIRE_MINIFLARE=1 so a
  // broken install fails the job instead of green-skipping all coverage.
  if (process.env.VPRS_REQUIRE_MINIFLARE === "1") throw error;
  /* not installed — suite skips */
}

const testDir = resolve(__dirname, "../fixtures/workerd-smoke.test");
const edgeDir = join(testDir, "dist/server-edge");

async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  await writeFile(
    join(testDir, "src/ping.ts"),
    `"use server";\n` +
      `export async function ping(n: number): Promise<{ doubled: number }> {\n` +
      `  return { doubled: n * 2 };\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/PingButton.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function PingButton({ ping }: { ping: (n: number) => Promise<{ doubled: number }> }) {\n` +
      `  return <button id="ping" onClick={() => ping(21)}>{"ping"}</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import React from "react";\n` +
      `import { ping } from "../ping.js";\n` +
      `import { PingButton } from "./PingButton.client.js";\n` +
      `export const Page = () => (\n` +
      `  <div id="app">\n` +
      `    <h1>{"workerd-smoke"}</h1>\n` +
      `    <PingButton ping={ping} />\n` +
      `  </div>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient();\n`
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

// The worker entry: only the baked pair, no bare imports — everything the
// isolate runs must come from dist/server-edge itself.
const WORKER = `import * as bundle from "./render.js";
import * as consumer from "./consumer.js";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST") return bundle.handleRouteAction(request);
    const flight = await bundle.renderRouteToFlight("/", request);
    if (url.pathname === "/flight") {
      return new Response(flight, {
        headers: { "content-type": "text/x-component" },
      });
    }
    const html = await consumer.renderFlightToHtml({ rscStream: flight });
    return new Response(html, { headers: { "content-type": "text/html" } });
  },
};
`;

async function collectModules(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile() && /\.m?js$/.test(entry.name)) {
      out.push(join(entry.parentPath, entry.name));
    }
  }
  return out.sort();
}

describe.skipIf(!Miniflare)("workerd smoke (webpack bake pair)", () => {
  let mf: InstanceType<NonNullable<typeof Miniflare>> | undefined;

  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupFixture();
    const fr = fileRouter(join(testDir, "src/routes"), { root: testDir });
    await doBuild({
      projectRoot: testDir,
      moduleBase: "src",
      transport: "webpack",
      Page: fr.Page,
      props: fr.props,
      routePatterns: fr.routePatterns,
      build: {
        pages: fr.build.pages,
        outDir: "dist",
        edge: true,
      },
    } as any);

    const workerPath = join(edgeDir, "worker.mjs");
    await writeFile(workerPath, WORKER);

    // Enumerated modules + modulesRoot: miniflare 4's schema (5.x alpha changed
    // it). compatibilityDate current, deliberately NO nodejs_compat — the point
    // is that the pair runs without node shims.
    const chunkPaths = (await collectModules(edgeDir)).filter(
      (p) => p !== workerPath
    );
    mf = new Miniflare!({
      compatibilityDate: "2026-07-01",
      modulesRoot: edgeDir,
      modules: [
        { type: "ESModule", path: workerPath },
        ...chunkPaths.map((path) => ({ type: "ESModule", path })),
      ],
    });
  }, 240000);

  afterAll(async () => {
    await mf?.dispose();
    if (!process.env.KEEP_FIXTURE)
      await rm(testDir, { recursive: true, force: true });
  });

  it("renders a webpack-flavored flight in-isolate", async () => {
    const res = await mf!.dispatchFetch("http://localhost/flight");
    expect(res.status).toBe(200);
    const body = await res.text();
    // The page's own markup rows...
    expect(body).toContain("workerd-smoke");
    // ...and a client-reference row resolved against the baked registry
    // (webpack flight spells module references as I[...] rows).
    expect(body).toMatch(/:I\[/);
  });

  it("decodes + renders that flight to HTML in the same isolate", async () => {
    const res = await mf!.dispatchFetch("http://localhost/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>workerd-smoke</h1>");
    // The client component resolved through the closed registry to its real
    // element, not a placeholder or a crashed boundary.
    expect(html).toContain('id="ping"');
    expect(html).not.toContain("Element type is invalid");
  });

  it("round-trips a server action through the sealed gate on-platform", async () => {
    const res = await mf!.dispatchFetch("http://localhost/", {
      method: "POST",
      headers: { "x-rsc-action": "src/ping.ts#ping" },
      body: "[21]",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('{"doubled":42}');
  });

  it("rejects a malformed action id loudly", async () => {
    const res = await mf!.dispatchFetch("http://localhost/", {
      method: "POST",
      headers: { "x-rsc-action": "src/ping.ts" },
      body: "[21]",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await res.text()).toMatch(/Invalid reference id|Unknown/);
  });
});
