import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCondition } from "vite-plugin-react-server/config";
import { setupIndexHTML } from "../setup.js";
import { createClientDevServer } from "../createDevServer.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

// End-to-end proof that a file-based dynamic route (`profile/$id`) is matched
// per-request and its loader receives the parsed params automatically
// (`props(url, { params })`), with NO `withParams` and no per-id build entry.
// Exercises the real dev pipeline: fileRouter → getRouteFiles match →
// resolvePageAndProps params plumbing → RSC render.
describe("file-based router — dynamic route renders per-request with params", () => {
  let server: ViteDevServer | undefined;
  let port = 5188;
  const testDir = join(
    process.cwd(),
    `test/fixtures/${getCondition()}/file-router-dynamic`,
  );

  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupIndexHTML(testDir);

    // Static index route.
    await mkdir(join(testDir, "src/routes"), { recursive: true });
    await writeFile(
      join(testDir, "src/routes/page.tsx"),
      `import React from "react";
export function Page() {
  return <div data-testid="home">Home</div>;
}
`,
    );

    // Dynamic route: profile/$id. The loader reads params.id — no pattern
    // repeated, no build entry per id.
    await mkdir(join(testDir, "src/routes/profile/$id"), { recursive: true });
    // A real client component ("use client"). Under the react-server condition
    // it must be emitted as a client reference, NOT executed server-side — the
    // same mechanism the package's Link/RouterProvider ride on.
    await writeFile(
      join(testDir, "src/Counter.client.tsx"),
      `"use client";
import React from "react";
export function Counter() {
  const [n, setN] = React.useState(0);
  return <button onClick={() => setN(n + 1)}>count {n}</button>;
}
`,
    );
    await writeFile(
      join(testDir, "src/routes/profile/$id/page.tsx"),
      `import React from "react";
import { Counter } from "../../../Counter.client.js";
export function Page({ label }: { label: string }) {
  return (
    <div data-testid="profile">
      {label}
      <Counter />
    </div>
  );
}
`,
    );
    // Build a single unambiguous token from the param so the assertion can't
    // collide with incidental digits in the flight (hashes, byte lengths).
    await writeFile(
      join(testDir, "src/routes/profile/$id/props.ts"),
      `export const props = (_url: string, { params }: { params: { id: string } }) => ({
  label: "pid-" + params.id + "-end",
});
`,
    );

    // Catch-all route: files/$ -> loader reads params._splat (the rest of the path).
    await mkdir(join(testDir, "src/routes/files/$"), { recursive: true });
    await writeFile(
      join(testDir, "src/routes/files/$/page.tsx"),
      `import React from "react";
export function Page({ label }: { label: string }) {
  return <div data-testid="file">{label}</div>;
}
`,
    );
    await writeFile(
      join(testDir, "src/routes/files/$/props.ts"),
      `export const props = (_url: string, { params }: { params: { _splat: string } }) => ({
  label: "splat-" + params._splat + "-end",
});
`,
    );

    const fr = fileRouter(join(testDir, "src/routes"), { root: testDir });

    server = await createClientDevServer(
      {
        projectRoot: testDir,
        moduleBase: "src",
        Page: fr.Page,
        props: fr.props,
        routePatterns: fr.routePatterns,
        build: { pages: fr.build.pages as string[] },
        verbose: false,
      } as any,
      port,
    );
    port = server.config.server.port ?? port;
  });

  afterAll(async () => {
    try {
      await server?.close();
    } catch {
      /* ignore */
    }
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  async function readFlight(path: string): Promise<string> {
    const res = await fetch(`http://localhost:${port}${path}`, {
      headers: { Accept: "text/x-component; charset=utf-8" },
    });
    expect(res.status).toBe(200);
    if (!res.body) throw new Error("no response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    reader.releaseLock();
    return out;
  }

  it("threads the parsed param into the loader for /profile/42", async () => {
    const flight = await readFlight("/profile/42/index.rsc");
    expect(flight).toContain("pid-42-end");
  });

  it("resolves a different id per-request (not cached to one page)", async () => {
    const flight = await readFlight("/profile/99/index.rsc");
    expect(flight).toContain("pid-99-end");
    expect(flight).not.toContain("pid-42-end");
  });

  it("threads a catch-all's _splat (rest of the path) into the loader", async () => {
    const flight = await readFlight("/files/a/b/c.png/index.rsc");
    expect(flight).toContain("splat-a/b/c.png-end");
  });

  // Guards the concern that running dev under `--conditions react-server`
  // breaks the (client) router: a "use client" component on a fileRouter route
  // renders as a client reference here, so Link/RouterProvider (also client
  // components) work the same way — they never execute in the server process.
  it("emits a client component on a route as a client reference (react-server dev)", async () => {
    const flight = await readFlight("/profile/42/index.rsc");
    expect(flight).toContain("pid-42-end"); // server render still succeeded
    // A client reference points at the client module; the flight carries the
    // module id (with a $L/import marker), never the executed component.
    expect(flight).toMatch(/Counter\.client/);
  });
});
