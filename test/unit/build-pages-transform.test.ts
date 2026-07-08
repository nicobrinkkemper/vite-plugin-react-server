import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveOptions } from "../../plugin/config/resolveOptions.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../router-fixtures");

// c2u.4: `build.pages` function form receives the ROUTER-derived worklist so a
// user can filter / extend / replace it without restating routes.
describe("build.pages(routerPages) transform", () => {
  const fr = fileRouter("routes", { root });

  async function resolvedPages(buildPages: unknown): Promise<string[]> {
    const res = resolveOptions(
      {
        projectRoot: root,
        moduleBase: "routes",
        routes: fr,
        build: { pages: buildPages },
      } as never,
      true,
    );
    if (res.type !== "success") throw res.error;
    const pages = res.userOptions.build.pages;
    const out =
      typeof pages === "function"
        ? await (pages as () => Promise<string[]> | string[])()
        : pages;
    return (out as string[]) ?? [];
  }

  it("passes the router's static routes into the transform (extend)", async () => {
    const pages = await resolvedPages((routerPages: string[]) => [
      ...routerPages,
      "/extra",
    ]);
    expect(pages).toContain("/"); // a router static route
    expect(pages).toContain("/extra"); // user-added
  });

  it("lets the transform filter the router list", async () => {
    const pages = await resolvedPages((routerPages: string[]) =>
      routerPages.filter((p) => p !== "/"),
    );
    expect(pages).not.toContain("/");
  });

  it("treats a nullary function as replace (ignores the router list)", async () => {
    const pages = await resolvedPages(() => ["/only-this"]);
    expect(pages).toEqual(["/only-this"]);
  });

  it("uses the router list as-is when build.pages is absent", async () => {
    const pages = await resolvedPages(undefined);
    expect(pages).toContain("/");
  });
});
