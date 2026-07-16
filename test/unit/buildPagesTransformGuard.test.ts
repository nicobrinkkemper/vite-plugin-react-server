import { describe, it, expect } from "vitest";
import { resolveOptions } from "../../plugin/config/resolveOptions.js";

/**
 * Regression guard for the silent-empty-site config mistake:
 * `build.pages: (routerPages) => …` only receives a list when `routes:` is
 * configured. Without a router table the transform was handed `[]`, filtered an
 * empty list, and the build prerendered nothing — green, silent, empty.
 */
const base = { moduleBase: "src", forceResolve: true } as never;

const resolve = (build: Record<string, unknown>) =>
  resolveOptions({ ...(base as object), build } as never);

describe("config/resolveOptions — build.pages transform guard", () => {
  it("REGRESSION: rejects a (routerPages) => … transform when no routes: router is configured", () => {
    const result = resolve({
      pages: (routerPages: string[]) => routerPages.filter((p) => p !== "/"),
    });

    expect(result.type).toBe("error");
    // Never null: callers that rethrow must get a real Error, and the message
    // has to name both the cause and the way out.
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toMatch(/routes:/);
    expect((result.error as Error).message).toMatch(/prerender nothing/);
  });

  it("still accepts the legacy nullary thunk (replace form) without a router", () => {
    const result = resolve({ pages: () => ["/", "/about"] });
    expect(result.type).toBe("success");
  });

  it("still accepts an array without a router", () => {
    const result = resolve({ pages: ["/", "/about"] });
    expect(result.type).toBe("success");
  });

  it("accepts an absent build.pages", () => {
    const result = resolve({});
    expect(result.type).toBe("success");
  });
});
