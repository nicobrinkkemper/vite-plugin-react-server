import { describe, it, expect } from "vitest";
import { resolveOptions } from "../../plugin/config/resolveOptions.js";
import { resolvePages } from "../../plugin/config/resolvePages.js";

/**
 * `build.pages: (routerPages) => …` is documented as a transform over the
 * derived page list. Without a `routes:` router it used to receive `[]`, so a
 * filter prerendered NOTHING and an extend silently dropped the index — a
 * green, empty build with no diagnostic.
 *
 * A routerless app is the degenerate one-route router: its derived list is the
 * index its `Page` serves. These lock that in, and lock in that only the
 * TRANSFORM's input defaults — never the worklist itself.
 */
const base = { moduleBase: "src", forceResolve: true } as never;

const pagesFor = async (build: Record<string, unknown>) => {
  const result = resolveOptions({ ...(base as object), build } as never);
  expect(result.type).toBe("success");
  const resolved = await resolvePages(
    (result.userOptions as { build: { pages: unknown } }).build.pages as never
  );
  expect(resolved.type).toBe("success");
  return resolved.pages;
};

describe("config/resolveOptions — build.pages transform without a routes: router", () => {
  it("REGRESSION: an extend transform keeps the index instead of dropping it", async () => {
    // Was: [] -> ["/extra"], silently losing "/".
    await expect(
      pagesFor({ pages: (routerPages: string[]) => [...routerPages, "/extra"] })
    ).resolves.toEqual(["/", "/extra"]);
  });

  it("REGRESSION: a filter transform sees the index, so it can act on it", async () => {
    // Was: [] -> [] (empty site, no diagnostic). Now the index is really there,
    // so excluding it is a deliberate choice with a visible effect.
    await expect(
      pagesFor({ pages: (routerPages: string[]) => routerPages.filter((p) => p !== "/") })
    ).resolves.toEqual([]);
  });

  it("passes the index through an identity transform", async () => {
    await expect(
      pagesFor({ pages: (routerPages: string[]) => routerPages })
    ).resolves.toEqual(["/"]);
  });

  it("hands the transform a FRESH array — user mutation can't leak across builds", async () => {
    const mutate = (routerPages: string[]) => {
      routerPages.push("/mutated");
      return routerPages;
    };
    await expect(pagesFor({ pages: mutate })).resolves.toEqual(["/", "/mutated"]);
    // A shared constant would now carry "/mutated" into the next resolve.
    await expect(pagesFor({ pages: mutate })).resolves.toEqual(["/", "/mutated"]);
  });

  it("leaves the legacy nullary thunk (replace form) alone", async () => {
    await expect(pagesFor({ pages: () => ["/only"] })).resolves.toEqual(["/only"]);
  });

  it("leaves an explicit array alone", async () => {
    await expect(pagesFor({ pages: ["/", "/about"] })).resolves.toEqual([
      "/",
      "/about",
    ]);
  });

  it("does NOT default the worklist: absent build.pages still prerenders nothing", async () => {
    // Only the transform's INPUT defaults to the index. Defaulting the worklist
    // would start prerendering an index for client-only builds.
    await expect(pagesFor({})).resolves.toEqual([]);
  });
});
