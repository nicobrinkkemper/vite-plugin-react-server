import { describe, expect, it } from "vitest";
import { withParams } from "../../plugin/router/withParams.js";

describe("withParams", () => {
  it("supplies parsed params to the loader", () => {
    const props = withParams("/profile/$id", ({ params }) => ({ id: params.id }));
    expect(props("/profile/123")).toEqual({ id: "123" });
  });

  it("passes the url through alongside params", () => {
    const props = withParams("/blog/$category/$slug", (ctx) => ctx);
    expect(props("/blog/tech/rsc")).toEqual({
      url: "/blog/tech/rsc",
      params: { category: "tech", slug: "rsc" },
    });
  });

  it("gives the loader {} params when the url doesn't match the pattern", () => {
    const props = withParams("/profile/$id", ({ params }) => params);
    expect(props("/something/else/entirely")).toEqual({});
  });

  it("supports async loaders", async () => {
    const props = withParams("/u/$name", async ({ params }) => `hi ${params.name}`);
    await expect(props("/u/ada")).resolves.toBe("hi ada");
  });
});
