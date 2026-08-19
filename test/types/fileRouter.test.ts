import { describe, expectTypeOf, it } from "vitest";
import type { FileRouterConfig } from "../../plugin/router/fileRouter.js";
import type { PropsOpt, StreamPluginOptions, UrlOpt } from "../../plugin/types.js";

// The canonical fileRouter config (see examples/router/vite.config.ts) writes
// Page/props/routePatterns/build.pages straight into the plugin options. This
// guards the two properties that were missing from StreamPluginOptions and only
// surfaced in a consumer's tsc (never the internal suite): `props` narrowed to
// `UrlOpt` (function must return string) and an undeclared `routePatterns`.
// Run under `vitest --typecheck`.
describe("fileRouter → plugin options", () => {
  it("props resolver (may return undefined) is assignable to the props option", () => {
    expectTypeOf<FileRouterConfig["props"]>().toMatchTypeOf<PropsOpt>();
    // ...but NOT to a plain UrlOpt (whose function form must return a string) —
    // that narrowing is exactly what broke the consumer.
    expectTypeOf<FileRouterConfig["props"]>().not.toMatchTypeOf<UrlOpt>();
  });

  it("the canonical config object satisfies StreamPluginOptions", () => {
    // Real runtime values (vitest --typecheck runs the body too) with the exact
    // FileRouterConfig field types.
    const router: Pick<
      FileRouterConfig,
      "Page" | "props" | "routePatterns" | "build"
    > = {
      Page: (u) => u,
      props: () => undefined,
      routePatterns: [],
      build: { pages: [] },
    };
    // `satisfies` triggers the excess-property + assignability checks, exactly
    // like the example config — a regression on `routePatterns` (undeclared) or
    // `props` (too narrow) fails here.
    const options = {
      runner: "main" as const,
      moduleBase: "src",
      Page: router.Page,
      props: router.props,
      routePatterns: router.routePatterns,
      build: { pages: router.build.pages },
    } satisfies StreamPluginOptions;
    expectTypeOf(options).toMatchTypeOf<StreamPluginOptions>();
  });
});

describe("routes field", () => {
  it("accepts an empty config (scan moduleBase itself)", () => {
    const options = {
      runner: "main" as const,
      moduleBase: "app",
      routes: {},
    } satisfies StreamPluginOptions;
    expectTypeOf(options).toMatchTypeOf<StreamPluginOptions>();
  });

  it("accepts the declarative { dir } form", () => {
    const options = {
      runner: "main" as const,
      moduleBase: "src",
      routes: {
        dir: "page",
        staticPaths: { "/profile/$id": () => [{ id: "1" }] },
      },
    } satisfies StreamPluginOptions;
    expectTypeOf(options).toMatchTypeOf<StreamPluginOptions>();
  });

  it("accepts a pre-built router table", () => {
    const table = {
      Page: (u: string) => u,
      props: () => undefined,
      routePatterns: [] as readonly string[],
      build: { pages: [] as string[] },
    };
    const options = {
      runner: "main" as const,
      moduleBase: "src",
      routes: table,
    } satisfies StreamPluginOptions;
    expectTypeOf(options).toMatchTypeOf<StreamPluginOptions>();
  });
});
