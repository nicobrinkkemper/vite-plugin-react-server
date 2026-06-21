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

  it("accepts a contained file whose name starts with '..'", () => {
    // `..foo.ts` is a legit in-tree filename, not a traversal — a bare
    // startsWith('..') prefix check would wrongly reject it.
    expect(isPathWithin(BASE, "/proj/..foo.ts")).toBe(true);
  });

  it("rejects real parent traversal", () => {
    expect(isPathWithin(BASE, "/proj/../secret.ts")).toBe(false);
  });
});
