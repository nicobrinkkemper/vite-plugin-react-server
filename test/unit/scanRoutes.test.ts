import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRoutes } from "../../plugin/router/scanRoutes.js";

const ROUTES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../router-fixtures/routes",
);

describe("scanRoutes", () => {
  const routes = scanRoutes(ROUTES);
  const byPattern = Object.fromEntries(routes.map((r) => [r.pattern, r]));

  it("discovers every page.tsx as a route pattern", () => {
    expect(new Set(routes.map((r) => r.pattern))).toEqual(
      new Set([
        "/",
        "/profile/$id",
        "/profile/me",
        "/blog/$category/$slug",
        "/files/$",
      ]),
    );
  });

  it("flags $-segment routes as dynamic", () => {
    expect(byPattern["/profile/$id"].dynamic).toBe(true);
    expect(byPattern["/blog/$category/$slug"].dynamic).toBe(true);
    expect(byPattern["/files/$"].dynamic).toBe(true);
    expect(byPattern["/"].dynamic).toBe(false);
    expect(byPattern["/profile/me"].dynamic).toBe(false);
  });

  it("links a sibling props file only when present", () => {
    expect(byPattern["/profile/$id"].props).toMatch(/profile\/\$id\/props\.ts$/);
    expect(byPattern["/profile/me"].props).toBeUndefined();
  });

  it("points page at the route's page file", () => {
    expect(byPattern["/profile/$id"].page).toMatch(/profile\/\$id\/page\.tsx$/);
    expect(byPattern["/"].page).toMatch(/routes\/page\.tsx$/);
  });

  it("collects the root→leaf route.tsx layout chain per page", () => {
    // Root route.tsx wraps every page.
    expect(byPattern["/"].layouts).toHaveLength(1);
    expect(byPattern["/"].layouts[0].component).toMatch(/routes\/route\.tsx$/);
    // /blog/* is wrapped by root + blog layouts, in order.
    const blog = byPattern["/blog/$category/$slug"].layouts;
    expect(blog).toHaveLength(2);
    expect(blog[0].component).toMatch(/routes\/route\.tsx$/);
    expect(blog[1].component).toMatch(/blog\/route\.tsx$/);
    // A layout shares its segment's props.ts (blog/props.ts here).
    expect(blog[1].props).toMatch(/blog\/props\.ts$/);
    // A page with no route.tsx above it beyond the root has just the root layer.
    expect(byPattern["/profile/$id"].layouts).toHaveLength(1);
  });
});
