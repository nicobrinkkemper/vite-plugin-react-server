import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRoutes } from "../../plugin/router/scanRoutes.js";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../router-fixtures",
);
const ROUTES = join(FIXTURES, "routes-extras");

describe("scanRoutes parity extras", () => {
  const routes = scanRoutes(ROUTES);
  const byPattern = Object.fromEntries(routes.map((r) => [r.pattern, r]));

  it("accepts index.tsx as a leaf page", () => {
    expect(byPattern["/about"]).toBeDefined();
    expect(byPattern["/about"].page).toMatch(/about\/index\.tsx$/);
  });

  it("strips (group) segments from the URL but keeps their layers", () => {
    // (marketing)/about → /about, wrapped by root + (marketing) layouts.
    const about = byPattern["/about"];
    // First two layers are the root + (marketing) layouts; a third head-only
    // layer (about/head.ts) follows, asserted separately below.
    expect(about.layouts.slice(0, 2).map((l) => l.component)).toEqual([
      expect.stringMatching(/routes-extras\/route\.tsx$/),
      expect.stringMatching(/\(marketing\)\/route\.tsx$/),
    ]);
  });

  it("prefers page.tsx over index.tsx when both exist", () => {
    expect(byPattern["/dashboard/settings"].page).toMatch(
      /settings\/page\.tsx$/,
    );
  });

  it("collects error.tsx / head.ts onto the segment's layer", () => {
    const root = byPattern["/"].layouts[0];
    expect(root.error).toMatch(/routes-extras\/error\.tsx$/);
    expect(root.head).toMatch(/routes-extras\/head\.ts$/);
  });

  it("creates a boundaries-only layer (loading.tsx without route.tsx)", () => {
    const dash = byPattern["/dashboard"];
    expect(dash.layouts).toHaveLength(2);
    const layer = dash.layouts[1];
    expect(layer.component).toBeUndefined();
    expect(layer.loading).toMatch(/dashboard\/loading\.tsx$/);
  });

  it("a head-only child segment layers under its ancestors", () => {
    // about/head.ts adds a third layer with only `head` set.
    const about = byPattern["/about"];
    expect(about.layouts).toHaveLength(3);
    expect(about.layouts[2].component).toBeUndefined();
    expect(about.layouts[2].head).toMatch(/about\/head\.ts$/);
  });

  it("throws when pathless groups collapse two pages onto one URL", () => {
    expect(() => scanRoutes(join(FIXTURES, "routes-collide"))).toThrow(
      /both resolve to "\/"/,
    );
  });

  it("does not treat a barrel index.ts as a route", () => {
    // index pattern is jsx/tsx-only by default; index.ts would be a barrel.
    const routesWithCustom = scanRoutes(ROUTES, {
      indexPattern: /^__never__$/,
    });
    expect(
      routesWithCustom.find((r) => r.pattern === "/about"),
    ).toBeUndefined();
  });
});
