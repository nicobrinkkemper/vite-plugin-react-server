/**
 * Regression: a public subpath that is meant to expose the SAME API under both
 * the `react-server` and the browser/default condition must not silently drop
 * (or gain) exports in one of them.
 *
 * This is the class of bug that hid `createReactFetcher` (and callServer /
 * createCallServer) from `vite-plugin-react-server/utils` under the
 * `react-server` condition: the two condition targets had different export
 * surfaces, so a client module importing from `/utils` built fine in one
 * environment and failed in the other.
 *
 * NOTE: not every condition-split export belongs here. Many (`.`, the plugin,
 * react-static, the dev-server entries) are genuinely different server/client
 * implementations — and some client variants aren't even importable outside a
 * browser. Only list a subpath in SYMMETRIC_SUBPATHS once it's confirmed to be
 * a same-API-different-impl export, where divergent *names* are a real bug.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf-8")
) as { exports: Record<string, any> };

// Public subpaths whose export-name surface must match across conditions.
const SYMMETRIC_SUBPATHS = ["./utils"];

const runtimeNames = (mod: Record<string, unknown>): string[] =>
  Object.keys(mod)
    .filter((name) => name !== "default")
    .sort();

const importTarget = (relTarget: string) =>
  import(pathToFileURL(resolve(root, relTarget)).href) as Promise<
    Record<string, unknown>
  >;

describe("export-surface parity across conditions", () => {
  for (const sub of SYMMETRIC_SUBPATHS) {
    it(`${sub} exposes the same names under react-server and browser/default`, async () => {
      const entry = pkg.exports[sub];
      const serverTarget: string | undefined = entry?.["react-server"];
      const browserTarget: string | undefined = entry?.browser ?? entry?.default;
      expect(serverTarget, `${sub} has a react-server target`).toBeTruthy();
      expect(browserTarget, `${sub} has a browser/default target`).toBeTruthy();

      const [server, browser] = await Promise.all([
        importTarget(serverTarget!),
        importTarget(browserTarget!),
      ]);

      // Different impls are fine; different export NAMES break a consumer that
      // imports the subpath under the other condition.
      expect(runtimeNames(server)).toEqual(runtimeNames(browser));
    });
  }

  it("/utils exposes the RSC-client helpers under the react-server condition", async () => {
    const serverTarget: string = pkg.exports["./utils"]["react-server"];
    const mod = await importTarget(serverTarget);
    for (const name of [
      "createReactFetcher",
      "callServer",
      "createCallServer",
      "useRscHmr",
    ]) {
      expect(mod, `${name} missing from /utils under react-server`).toHaveProperty(
        name
      );
    }
  });
});
