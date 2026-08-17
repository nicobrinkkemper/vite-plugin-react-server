import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Dual-graph CSS: the SAME stylesheet imported by a "use client" component
 * (client module graph — Vite hot-swaps its injected <style>) AND by the
 * server page (collected into a server-rendered <link>). On edit, Vite's
 * swap alone leaves the <link> copy stale — cascade order can mask an edited
 * declaration, but a DELETED rule survives in the cached link. The plugin
 * must therefore still emit the kind:"css" cache-bust event alongside
 * handing Vite the hot-swappable modules, and must not fall back to a full
 * reload. Both dev orchestrators are covered by test:both — the client
 * (dev:ssr) leg exercises plugin.client.ts, the react-server leg
 * plugin.server.ts.
 */

let server: ViteDevServer;
const port = 3119;
const testDir = resolve(__dirname, "../fixtures/css-hmr-dual-graph.test");

const CSS = `.card { color: rgb(1, 2, 3); }\n.gone { margin: 7px; }\n`;

async function setupTestFiles() {
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(join(testDir, "src/page/card.module.css"), CSS);
  await writeFile(
    join(testDir, "src/page/Card.client.tsx"),
    `"use client";
import React from "react";
import styles from "./card.module.css";
export const Card = () => <div className={styles["card"]}>card</div>;`
  );
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import React from "react";
import styles from "./card.module.css";
import { Card } from "./Card.client.js";
export const Page = () => (
  <div className={styles["card"]}>
    server copy
    <Card />
  </div>
);`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = () => ({});`
  );
}

describe("dual-graph css edit", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupTestFiles();
    server = await createServer({
      root: testDir,
      configFile: false,
      server: { port, strictPort: true },
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
        }),
      ],
      logLevel: "warn",
    });
    await server.listen();
  }, 30000);

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("cache-busts the server-rendered link and never full-reloads", async () => {
    // Populate the server graph (RSC render) …
    const rsc = await fetch(`http://localhost:${port}/`, {
      headers: { Accept: "text/x-component" },
    });
    expect(rsc.ok).toBe(true);
    await rsc.text();
    // … and the CLIENT graph: transform the client component and its css
    // import the way a browser would, so the stylesheet gains a client-side
    // JS importer (the dual-graph condition).
    await (await fetch(`http://localhost:${port}/src/page/Card.client.tsx`)).text();
    // The css-as-JS module (what the browser's import graph requests — goes
    // through import analysis, which marks it self-accepting) AND the raw
    // form (what a server-rendered <link href> fetch creates).
    await (await fetch(`http://localhost:${port}/src/page/card.module.css?import`)).text();
    await (await fetch(`http://localhost:${port}/src/page/card.module.css`)).text();
    await sleep(200);
    // A real browser executes the css-as-JS module, whose dev transform
    // carries import.meta.hot.accept — Vite then marks the node
    // self-accepting and hot-swaps it in place. Plain fetches can't run that
    // client-side registration, so mirror the browser-driven state on the
    // graph node; without it the propagation dead-ends and this test would
    // assert a reload that real usage doesn't have.
    for (const m of (server as any).environments.client.moduleGraph.getModulesByFile(
      join(testDir, "src/page/card.module.css"),
    ) ?? []) {
      (m as { isSelfAccepting?: boolean }).isSelfAccepting = true;
    }

    const events: Array<{ type: string; event?: string; data?: { kind?: string } }> = [];
    const originalSend = server.ws.send.bind(server.ws);
    server.ws.send = function (payload: unknown) {
      if (payload && typeof payload === "object") {
        events.push(payload as (typeof events)[number]);
      }
      return originalSend(payload as never);
    } as typeof server.ws.send;

    // Delete a rule — the case cascade order cannot mask.
    const abs = join(testDir, "src/page/card.module.css");
    await writeFile(abs, `.card { color: rgb(9, 9, 9); }\n`);
    server.watcher.emit("change", abs);

    // Wait for the hotUpdate chain to run.
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (
        events.some(
          (e) =>
            e.type === "custom" &&
            e.event === "vite-plugin-react-server:server-component-update" &&
            e.data?.kind === "css",
        )
      )
        break;
      await sleep(100);
    }

    const cssEvents = events.filter(
      (e) =>
        e.type === "custom" &&
        e.event === "vite-plugin-react-server:server-component-update" &&
        e.data?.kind === "css",
    );
    // The cache-bust event is what refreshes the server-rendered <link>.
    expect(cssEvents.length).toBeGreaterThan(0);
    // And the dual-graph shape must not dead-end into a reload.
    expect(events.some((e) => e.type === "full-reload")).toBe(false);
  }, 20000);
});
