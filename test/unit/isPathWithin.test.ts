import { describe, it, expect } from "vitest";
import { isPathWithin } from "../../dist/plugin/helpers/isPathWithin.js";

// Shared containment primitive behind the server-action resolver, the dev worker
// gate, and the preview static server. Inputs are always absolute (join/resolve
// output); the guard rejects anything that escapes the base.
const BASE = "/proj";

describe("isPathWithin", () => {
  it("accepts a path inside the base", () => {
    expect(isPathWithin(BASE, "/proj/src/a.server.ts")).toBe(true);
  });

  it("accepts the base itself", () => {
    expect(isPathWithin(BASE, "/proj")).toBe(true);
  });

  it("rejects a sibling that shares a name prefix", () => {
    // /proj-secret must not count as inside /proj
    expect(isPathWithin(BASE, "/proj-secret/x")).toBe(false);
  });

  it("rejects a parent path", () => {
    expect(isPathWithin(BASE, "/")).toBe(false);
  });

  it("rejects an unrelated absolute path", () => {
    expect(isPathWithin(BASE, "/etc/passwd")).toBe(false);
  });
});
