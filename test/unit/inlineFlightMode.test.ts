import { describe, it, expect } from "vitest";
import { resolveOptions } from "../../plugin/config/resolveOptions.js";

// forceResolve bypasses the per-env stash so each case resolves fresh.
function resolveInlineFlight(inlineFlight: boolean | "blob" | "stream" | undefined) {
  const result = resolveOptions(
    inlineFlight === undefined ? {} : { build: { inlineFlight } },
    true
  );
  expect(result.type).toBe("success");
  if (result.type !== "success") throw new Error("unreachable");
  return result.userOptions.build.inlineFlight;
}

describe("build.inlineFlight resolves to a mode", () => {
  it("defaults to false", () => {
    expect(resolveInlineFlight(undefined)).toBe(false);
  });

  it("false stays false", () => {
    expect(resolveInlineFlight(false)).toBe(false);
  });

  it("true is the boolean alias for 'blob'", () => {
    expect(resolveInlineFlight(true)).toBe("blob");
  });

  it("'blob' passes through", () => {
    expect(resolveInlineFlight("blob")).toBe("blob");
  });
});

describe("build.inlineFlight 'stream' mode", () => {
  it("'stream' passes through as the resolved mode", () => {
    expect(resolveInlineFlight("stream")).toBe("stream");
  });
});
