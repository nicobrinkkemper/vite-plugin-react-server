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
});
