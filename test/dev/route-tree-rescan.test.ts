import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { handleRSCStream } from "../rsc-stream.js";
import { mkdir, rm, writeFile, symlink, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * The `routes` table is a scan of the route tree. While the dev server runs:
 *
 * - a route appearing or disappearing (a page file added or removed) changes
 *   the route set the config was resolved with, so the server restarts;
 * - any other file the scan reads (head, props, route, error, loading) added
 *   or removed under an existing route swaps the scan in place: no restart,
 *   the browser gets the server-component refetch, and the next flight
 *   reflects the file. Before, a new `about/head.ts` stayed invisible (the
 *   About flight kept the root language) until Vite was restarted by hand.
 *
 * Edits, files the scan ignores and files outside the tree restart nothing.
 */

let server: ViteDevServer;
const port = 3149;
const testDir = resolve(__dirname, "../fixtures/route-tree-rescan.test");
const routesDir = join(testDir, "src/routes");
const restart = vi.fn(async () => {});
const refetches: string[] = [];
/** Module urls the client environment pushed an HMR update or reload for. */
const clientUpdates: string[] = [];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const aboutFlight = async () => {
  const response = await handleRSCStream(
    `http://localhost:${port}/about/index.rsc`,
  );
  expect(response.ok).toBe(true);
  return response.result as string;
};

async function expectRestartAfter(change: () => Promise<void>) {
  const before = restart.mock.calls.length;
  await change();
  await vi.waitFor(
    () => expect(restart.mock.calls.length).toBeGreaterThan(before),
    { timeout: 10_000, interval: 50 },
  );
  // Let the coalescing window close before the next change.
  await pause(400);
}

/** No restart, a refetch for `file`, and the next About flight passes `check`. */
async function expectInPlaceAfter(
  file: string,
  change: () => Promise<void>,
  check: (flight: string) => void,
) {
  const before = restart.mock.calls.length;
  const refetchesBefore = refetches.length;
  await change();
  await vi.waitFor(
    () => expect(refetches.slice(refetchesBefore)).toContain(file),
    { timeout: 10_000, interval: 50 },
  );
  check(await aboutFlight());
  await pause(400);
  expect(restart.mock.calls.length).toBe(before);
}

async function expectNoRestartAfter(change: () => Promise<void>) {
  const before = restart.mock.calls.length;
  await change();
  await pause(1_500);
  expect(restart.mock.calls.length).toBe(before);
}

describe("dev server follows the route tree", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupIndexHTML(testDir);
    await mkdir(join(routesDir, "about"), { recursive: true });
    await mkdir(join(routesDir, "gone"), { recursive: true });
    await writeFile(
      join(routesDir, "gone/page.tsx"),
      `export const Page = () => <div>gone</div>;`,
    );
    await mkdir(join(testDir, "src/other"), { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export const Page = () => <div>Home</div>;`,
    );
    await writeFile(
      join(routesDir, "head.ts"),
      `export const head = { lang: "en" };`,
    );
    await writeFile(
      join(routesDir, "about/page.tsx"),
      `export const Page = ({ msg }: { msg?: string }) => <div>{"about:" + (msg ?? "no-props")}</div>;`,
    );
    try {
      await symlink(
        resolve(__dirname, "../../node_modules"),
        join(testDir, "node_modules"),
        "dir",
      );
    } catch {}

    server = await createServer({
      mode: "test",
      root: testDir,
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          Page: undefined,
          props: undefined,
          projectRoot: testDir,
          moduleBase: "src",
          routes: { dir: "routes" },
        }),
      ],
      server: { port },
    });
    // Observe the restart instead of performing it, and record refetches.
    server.restart = restart;
    const send = server.ws.send.bind(server.ws) as (...a: unknown[]) => void;
    server.ws.send = ((...args: unknown[]) => {
      const payload = args[0] as { event?: string; data?: { path?: string } };
      if (
        payload?.event === "vite-plugin-react-server:server-component-update" &&
        payload.data?.path
      ) {
        refetches.push(payload.data.path);
      }
      return send(...args);
    }) as typeof server.ws.send;
    const hot = server.environments.client.hot;
    const hotSend = hot.send.bind(hot) as (...a: unknown[]) => void;
    hot.send = ((...args: unknown[]) => {
      const payload = args[0] as {
        type?: string;
        updates?: { path: string }[];
        triggeredBy?: string;
      };
      if (payload?.type === "update") {
        for (const u of payload.updates ?? []) clientUpdates.push(u.path);
      } else if (payload?.type === "full-reload" && payload.triggeredBy) {
        clientUpdates.push(
          "/" + payload.triggeredBy.slice(testDir.length + 1).split("\\").join("/"),
        );
      }
      return hotSend(...args);
    }) as typeof hot.send;
    await server.listen();
    // The watcher reports changes only once its initial scan is done; under
    // load that can trail listen(). Wait until it sees a probe file.
    const probe = join(routesDir, "watcher-probe.txt");
    const seen = new Promise<void>((resolve) => {
      const onAdd = (f: string) => {
        if (f !== probe) return;
        server.watcher.off("add", onAdd);
        resolve();
      };
      server.watcher.on("add", onAdd);
    });
    for (let i = 0; ; i++) {
      await writeFile(probe, String(i));
      const ok = await Promise.race([seen.then(() => true), pause(500).then(() => false)]);
      if (ok) break;
      await rm(probe, { force: true });
      await pause(100);
    }
    await rm(probe, { force: true });
    // Warm the route so later flights read cached resolutions if any survive.
    expect(await aboutFlight()).toContain("about:no-props");
  }, 60_000);

  afterAll(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      server?.close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 15_000);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    await rm(testDir, { recursive: true, force: true });
  }, 30_000);

  it("a segment's head.ts sets the language without a restart", async () => {
    const file = join(routesDir, "about/head.ts");
    await expectInPlaceAfter(
      file,
      () => writeFile(file, `export const head = { lang: "nl" };`),
      (flight) => expect(flight).toContain(`\\"lang\\":\\"nl\\"`),
    );
    await expectInPlaceAfter(
      file,
      () => unlink(file),
      (flight) => {
        expect(flight).toContain(`\\"lang\\":\\"en\\"`);
        expect(flight).not.toContain(`\\"lang\\":\\"nl\\"`);
      },
    );
  }, 30_000);

  it("a head.ts deleted and recreated serves the new contents", async () => {
    const file = join(routesDir, "about/head.ts");
    await expectInPlaceAfter(
      file,
      () => writeFile(file, `export const head = { lang: "nl" };`),
      (flight) => expect(flight).toContain(`\\"lang\\":\\"nl\\"`),
    );
    await expectInPlaceAfter(
      file,
      () => unlink(file),
      (flight) => expect(flight).not.toContain(`\\"lang\\":\\"nl\\"`),
    );
    await expectInPlaceAfter(
      file,
      () => writeFile(file, `export const head = { lang: "fr" };`),
      (flight) => {
        expect(flight).toContain(`\\"lang\\":\\"fr\\"`);
        expect(flight).not.toContain(`\\"lang\\":\\"nl\\"`);
      },
    );
    await expectInPlaceAfter(file, () => unlink(file), () => {});
  }, 30_000);

  it('a "use client" route file deleted and recreated gets Vite\'s client update (HMR or full reload) and serves the new source', async () => {
    // The browser fetches "use client" modules from the client environment by
    // url; a recreated file must not be served from the old transform, and
    // Vite must tell the browser the module changed. Without a Fast Refresh
    // plugin that is a full reload: client route files follow Vite's normal
    // client HMR and keep no client state, unlike server route files.
    const file = join(routesDir, "about/error.tsx");
    const url = "/src/routes/about/error.tsx";
    const source = (marker: string) =>
      `"use client";\nexport const ErrorBoundary = ({ children }: { children?: React.ReactNode }) => <>{"${marker}"}{children}</>;`;
    const client = server.environments.client;
    await expectInPlaceAfter(file, () => writeFile(file, source("err-v1")), () => {});
    expect((await client.transformRequest(url))?.code).toContain("err-v1");
    await expectInPlaceAfter(file, () => unlink(file), () => {});
    const updatesBefore = clientUpdates.length;
    await expectInPlaceAfter(file, () => writeFile(file, source("err-v2")), () => {});
    await vi.waitFor(
      () => expect(clientUpdates.slice(updatesBefore)).toContain(url),
      { timeout: 5_000, interval: 50 },
    );
    expect((await client.transformRequest(url))?.code).toContain("err-v2");
    await expectInPlaceAfter(file, () => unlink(file), () => {});
  }, 30_000);

  it("a segment's props.ts loads without a restart", async () => {
    const file = join(routesDir, "about/props.ts");
    await expectInPlaceAfter(
      file,
      () => writeFile(file, `export const props = () => ({ msg: "from-props" });`),
      (flight) => expect(flight).toContain("about:from-props"),
    );
    await expectInPlaceAfter(
      file,
      () => unlink(file),
      (flight) => expect(flight).toContain("about:no-props"),
    );
  }, 30_000);

  it("a segment's route.tsx wraps the page without a restart", async () => {
    const file = join(routesDir, "about/route.tsx");
    await expectInPlaceAfter(
      file,
      () =>
        writeFile(
          file,
          `export const Layout = ({ children }: { children?: React.ReactNode }) => <section>{"about-layout"}{children}</section>;`,
        ),
      (flight) => expect(flight).toContain("about-layout"),
    );
    await expectInPlaceAfter(
      file,
      () => unlink(file),
      (flight) => expect(flight).not.toContain("about-layout"),
    );
  }, 30_000);

  it("a segment's loading.tsx joins the chain without a restart", async () => {
    const file = join(routesDir, "about/loading.tsx");
    await expectInPlaceAfter(
      file,
      () =>
        writeFile(file, `export const Loading = () => <p>{"about-loading"}</p>;`),
      (flight) => expect(flight).toContain("about-loading"),
    );
    await expectInPlaceAfter(
      file,
      () => unlink(file),
      (flight) => expect(flight).not.toContain("about-loading"),
    );
  }, 30_000);

  it("a segment's error.tsx joins the chain without a restart", async () => {
    const file = join(routesDir, "about/error.tsx");
    await expectInPlaceAfter(
      file,
      () =>
        writeFile(
          file,
          `"use client";\nexport const ErrorBoundary = ({ children }: { children?: React.ReactNode }) => children;`,
        ),
      (flight) => expect(flight).toContain("about/error.tsx"),
    );
    await expectInPlaceAfter(
      file,
      () => unlink(file),
      (flight) => expect(flight).not.toContain("about/error.tsx"),
    );
  }, 30_000);

  it("no restart on editing an existing route file; HMR serves it", async () => {
    await expectNoRestartAfter(() =>
      writeFile(join(routesDir, "head.ts"), `export const head = { lang: "de" };`),
    );
    expect(await aboutFlight()).toContain(`\\"lang\\":\\"de\\"`);
  }, 30_000);

  it("no restart for files the scan ignores or outside the route tree", async () => {
    await expectNoRestartAfter(async () => {
      await writeFile(join(routesDir, "about/Widget.tsx"), `export {};`);
      await writeFile(join(testDir, "src/other/page.tsx"), `export {};`);
      await writeFile(join(testDir, "src/other/head.ts"), `export {};`);
    });
  }, 30_000);
  // Last: the stubbed restart leaves the table on the route set it started
  // with, so every later change would compare against that.
  it.each(["page.tsx", "index.tsx"])(
    "restarts when a %s adds a route",
    async (name) => {
      const file = join(routesDir, `fresh-${name.split(".")[0]}`, name);
      await mkdir(join(file, ".."), { recursive: true });
      await expectRestartAfter(() =>
        writeFile(file, `export const Page = () => <div>fresh</div>;`),
      );
    },
    30_000,
  );

  it("restarts when removing a page removes a route", async () => {
    await expectRestartAfter(() => unlink(join(routesDir, "gone/page.tsx")));
  }, 30_000);
});
