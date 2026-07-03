import { describe, expectTypeOf, it } from "vitest";
import { withParams } from "../../plugin/router/withParams.js";

// The loader's `params` are inferred from the pattern literal. Run under
// `vitest --typecheck`.
describe("withParams typing", () => {
  it("infers params from the pattern", () => {
    withParams("/profile/$id", (ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>();
      expectTypeOf(ctx.url).toEqualTypeOf<string>();
      return ctx.params;
    });
  });

  it("infers multiple params", () => {
    withParams("/blog/$category/$slug", (ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{ category: string; slug: string }>();
      return null;
    });
  });

  it("preserves the loader's return type", () => {
    const props = withParams("/u/$name", ({ params }) => ({ name: params.name }));
    expectTypeOf(props).toEqualTypeOf<(url: string) => { name: string }>();
  });
});
