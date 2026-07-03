import { describe, expectTypeOf, it } from "vitest";
import { matchRoute, type RouteParams } from "../../plugin/router/matchRoute.js";

// Params are inferred from the pattern literal via template-literal types — no
// codegen, no hand-maintained map. Run under `vitest --typecheck`.

describe("RouteParams inference", () => {
  it("infers a single param", () => {
    expectTypeOf<RouteParams<"/profile/$id">>().toEqualTypeOf<{ id: string }>();
  });

  it("infers multiple params", () => {
    expectTypeOf<RouteParams<"/blog/$category/$slug">>().toEqualTypeOf<{
      category: string;
      slug: string;
    }>();
  });

  it("has no keys for a fully-static route", () => {
    expectTypeOf<keyof RouteParams<"/profile/me">>().toEqualTypeOf<never>();
    expectTypeOf<keyof RouteParams<"/">>().toEqualTypeOf<never>();
  });

  it("maps a bare $ catch-all to _splat", () => {
    expectTypeOf<RouteParams<"/files/$">>().toEqualTypeOf<{ _splat: string }>();
  });

  it("types matchRoute's return as params-or-null", () => {
    expectTypeOf(matchRoute("/profile/$id", "/profile/1")).toEqualTypeOf<
      { id: string } | null
    >();
  });
});
