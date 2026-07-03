import { describe, expectTypeOf, it } from "vitest";
import type { FileRouterConfig } from "../../plugin/router/fileRouter.js";
import type { PropsOpt, UrlOpt } from "../../plugin/types.js";

// Spreading `...fileRouter("src/routes")` into the plugin options must stay
// type-safe. `fileRouter().props` is `(url) => string | undefined` (a route may
// have no props.ts), so the plugin's `props` option has to accept a resolver
// that returns `string | undefined` — regression guard for the props option
// being narrowed to `UrlOpt` (function must return `string`). Run under
// `vitest --typecheck`.
describe("fileRouter → plugin option assignability", () => {
  it("props resolver (may return undefined) is assignable to the props option", () => {
    expectTypeOf<FileRouterConfig["props"]>().toMatchTypeOf<PropsOpt>();
  });

  it("Page resolver (always a string) is assignable to a UrlOpt", () => {
    expectTypeOf<FileRouterConfig["Page"]>().toMatchTypeOf<UrlOpt>();
  });
});
