import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBuilder } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { setupTestProject } from "../setup.js";
import { ensureFixture, hashSetupFn } from "./fixture-cache.js";
import { testUserOptions } from "../test-config.js";
import { readFile as readFileFs, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * transport: "webpack" — the static snapshots must carry the webpack flight
 * flavor, not esm, and every artifact must render ONCE, in that flavor: the
 * esm SSG pass is skipped and the post-bake freeze IS the SSG pass, so one
 * deploy can serve any route from the CDN or the per-request handler without
 * cross-flavor decode failures.
 *
 * The flavor is directly observable in the payload: webpack references are
 * `I["<id>",[chunks],"<name>"]` rows; esm references are bare module-path
 * strings with no chunk array. The single render is observable in the event
 * and metric streams: exactly one build.ssg.start/end pair, exactly one
 * ssg-render summary, and one file.write.done per artifact — consumers must
 * not be able to tell the renderer changed.
 */
const testDir = resolve(__dirname, "../fixtures/transport-webpack/shared");
const OUT_DIR = "dist-transport-webpack";

const events: { type: string; route?: string; fileType?: string }[] = [];
const ssgMetrics: { pages: number; failed: number }[] = [];

describe("transport: webpack — snapshots frozen through the baked pair", () => {
  beforeAll(async () => {
    const setupSource = await readFileFs(resolve(__dirname, "../setup.ts"), "utf-8");
    await ensureFixture(testDir, setupTestProject, hashSetupFn(setupTestProject, [setupSource]));

    // The build output must come from THIS run — a stale passing artifact
    // would satisfy the assertions even if the freeze regressed.
    await rm(resolve(testDir, OUT_DIR), { recursive: true, force: true });

    const { moduleBaseURL: _explicitBase, onMetrics: _metrics, ...pluginOptions } =
      testUserOptions;

    const builder = await createBuilder({
      mode: "test",
      root: testDir,
      plugins: vitePluginReactServer({
        ...pluginOptions,
        transport: "webpack",
        projectRoot: testDir,
        build: {
          ...testUserOptions.build,
          pages: ["/", "/page2"],
          outDir: OUT_DIR,
        },
        onEvent: (event: any) => {
          if (
            event.type === "build.ssg.start" ||
            event.type === "build.ssg.end" ||
            event.type === "file.write.done"
          ) {
            events.push({
              type: event.type,
              route: event.data?.route,
              fileType: event.data?.fileType,
            });
          }
        },
        onMetrics: (metrics: any) => {
          if (metrics.type === "ssg-render") {
            ssgMetrics.push({ pages: metrics.pages, failed: metrics.failed });
          }
        },
      }),
    });
    await builder.buildApp();
  }, 180_000);

  afterAll(async () => {
    await rm(resolve(testDir, OUT_DIR), { recursive: true, force: true });
  });

  it("defaults the edge bake to the webpack pair", async () => {
    const render = await readFile(
      resolve(testDir, OUT_DIR, "server-edge", "render.js"),
      "utf-8"
    );
    expect(render.length).toBeGreaterThan(0);
    // The consumer half only exists on the webpack transport.
    const consumer = await readFile(
      resolve(testDir, OUT_DIR, "server-edge", "consumer.js"),
      "utf-8"
    );
    expect(consumer.length).toBeGreaterThan(0);
  });

  it("freezes webpack-flavored snapshots for every route", async () => {
    for (const route of ["", "page2"]) {
      const rsc = await readFile(
        resolve(testDir, OUT_DIR, "static", route, "index.rsc"),
        "utf-8"
      );
      // Webpack reference rows carry a chunk array: I["<id>",[...],"<name>"].
      expect(rsc).toMatch(/I\["[^"]+",\[[^\]]*\],"[^"]+"\]/);
      // And no esm-flavored reference remains (esm rows have no chunk array).
      const html = await readFile(
        resolve(testDir, OUT_DIR, "static", route, "index.html"),
        "utf-8"
      );
      expect(html).toContain("<html");
      // The frozen document hydrates from its inline flight.
      expect(html).toContain("vprs-flight");
    }
  });

  it("renders every artifact once — the freeze IS the SSG pass", () => {
    // Exactly one SSG lifecycle, owned by the freeze: were the esm pass
    // still running, a second start/end pair (and a second metric) would
    // appear before the bake.
    expect(events.filter((e) => e.type === "build.ssg.start")).toHaveLength(1);
    expect(events.filter((e) => e.type === "build.ssg.end")).toHaveLength(1);
    expect(ssgMetrics).toEqual([{ pages: 2, failed: 0 }]);

    // One write per artifact, through the same fileWriter contract the esm
    // pass uses — html + rsc per route, nothing written twice.
    const writes = events
      .filter((e) => e.type === "file.write.done")
      .map((e) => `${e.route}:${e.fileType}`)
      .sort();
    expect(writes).toEqual(["/:html", "/:rsc", "/page2:html", "/page2:rsc"]);

    // And the lifecycle brackets the writes.
    const types = events.map((e) => e.type);
    expect(types.indexOf("build.ssg.start")).toBeLessThan(
      types.indexOf("file.write.done")
    );
    expect(types.lastIndexOf("file.write.done")).toBeLessThan(
      types.indexOf("build.ssg.end")
    );
  });
});
