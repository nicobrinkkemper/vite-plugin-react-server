import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBuilder } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { setupTestProject } from "../setup.js";
import { ensureFixture, hashSetupFn } from "./fixture-cache.js";
import { testUserOptions } from "../test-config.js";
import { readFile as readFileFs, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { getCondition } from "../../plugin/config/getCondition.js";

/**
 * Probe: can the ESM flight client decode a WEBPACK-flavored payload?
 *
 * The client-imported server-fn proxy path is esm-hardcoded regardless of
 * transport (createTransformerPlugin/serverReferenceClientPlugin emit the
 * esm createServerReference import; createCallServer imports the esm
 * createFromFetch). Under transport:"webpack" the action RESPONSE is
 * webpack-flavored, so the proxy path pairs an esm decoder with webpack
 * bytes. This test builds a real webpack-transport app and feeds its actual
 * frozen payload to the esm browser client — the exact pairing that proxy
 * path creates in a browser.
 *
 * The esm client needs client-condition React; the probe is meaningless (and
 * unloadable) under react-server, so it runs on the client leg only.
 */
const clientLeg = getCondition() !== "react-server" ? describe : describe.skip;

const testDir = resolve(__dirname, "../fixtures/transport-webpack/esm-decode-probe");
const OUT_DIR = "dist-esm-decode-probe";

clientLeg("esm flight client fed a webpack-flavored payload", () => {
  beforeAll(async () => {
    const setupSource = await readFileFs(resolve(__dirname, "../setup.ts"), "utf-8");
    await ensureFixture(testDir, setupTestProject, hashSetupFn(setupTestProject, [setupSource]));
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
          pages: ["/"],
          outDir: OUT_DIR,
        },
      }),
    });
    await builder.buildApp();
  }, 180_000);

  afterAll(async () => {
    await rm(resolve(testDir, OUT_DIR), { recursive: true, force: true });
  });

  it("documents the decode outcome", async () => {
    const payload = await readFile(
      resolve(testDir, OUT_DIR, "static", "index.rsc"),
      "utf-8"
    );
    // Sanity: this really is a webpack payload (reference rows carry a chunk
    // array) — otherwise the probe proves nothing.
    expect(payload).toMatch(/I\["[^"]+",\[[^\]]*\],"[^"]+"\]/);

    const { createFromReadableStream } = await import(
      "react-server-dom-esm/client.browser"
    );
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    let outcome = "resolved";
    let detail = "";
    try {
      const root = await createFromReadableStream(stream, {
        moduleBaseURL: "",
        callServer: () => {
          throw new Error("probe: callServer must not be reached");
        },
      });
      // Force the tree: reference rows resolve lazily, so touching the
      // element graph is not enough — REACT_LAZY payloads must be inited,
      // which is what triggers module metadata use (the flavor-sensitive
      // part) exactly as a real render would.
      const LAZY = Symbol.for("react.lazy");
      const forced: string[] = [];
      const walk = (node: unknown, depth: number): void => {
        if (depth > 30 || node == null || typeof node !== "object") return;
        if (Array.isArray(node)) {
          for (const child of node) walk(child, depth + 1);
          return;
        }
        const el = node as {
          $$typeof?: symbol;
          _init?: (payload: unknown) => unknown;
          _payload?: unknown;
          props?: { children?: unknown };
          type?: unknown;
        };
        if (el.$$typeof === LAZY && typeof el._init === "function") {
          forced.push("lazy");
          walk(el._init(el._payload), depth + 1);
          return;
        }
        if (el.type && typeof el.type === "object") walk(el.type, depth + 1);
        if (el.props) walk(el.props.children, depth + 1);
      };
      walk(root, 0);
      detail = `(${forced.length} lazy nodes forced)`;
    } catch (error) {
      // A thrown thenable is Suspense ("module loading"), not a verdict —
      // the verdict is whether that load settles or rejects.
      if (error && typeof (error as PromiseLike<unknown>).then === "function") {
        try {
          await (error as PromiseLike<unknown>);
          outcome = "suspended-then-loaded";
        } catch (loadError) {
          outcome = "module-load-rejected";
          detail = String(loadError);
        }
      } else {
        outcome = "threw";
        detail = String(error);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[probe] webpack payload → esm decoder: ${outcome} ${detail}`);
    expect(outcome).toBe("module-load-rejected");
  });
});
