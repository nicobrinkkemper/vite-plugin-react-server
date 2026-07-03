import { describe, expectTypeOf, it } from "vitest";
import type { ToPath } from "../../plugin/router/register.js";

// The Register pattern narrows route paths via declaration merging. Run under
// `vitest --typecheck`.
describe("Register / ToPath", () => {
  it("falls back to string (accepts any path) with no augmentation", () => {
    // Default Register is empty → ToPath accepts arbitrary concrete paths.
    expectTypeOf<"/greet/alice">().toMatchTypeOf<ToPath>();
    expectTypeOf<"/anything/at/all">().toMatchTypeOf<ToPath>();
  });

  it("narrows RegisteredRoutes to the declared union when augmented", () => {
    // Mirrors the conditional the exported RegisteredRoutes uses, verified
    // without a global module augmentation.
    type Narrowed = { routes: "/" | "/greet/$name" } extends {
      routes: infer R extends string;
    }
      ? R
      : string;
    expectTypeOf<Narrowed>().toEqualTypeOf<"/" | "/greet/$name">();
  });
});
