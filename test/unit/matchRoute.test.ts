import { describe, expect, it } from "vitest";
import { matchRoute, matchRoutes } from "../../plugin/router/matchRoute.js";

// matchRoute works on a clean pathname; the caller (requestToRoute) strips the
// query/hash before matching.

describe("matchRoute", () => {
  it("matches the root route to empty params", () => {
    expect(matchRoute("/", "/")).toEqual({});
  });

  it("extracts a single $param", () => {
    expect(matchRoute("/profile/$id", "/profile/123")).toEqual({ id: "123" });
  });

  it("extracts multiple $params", () => {
    expect(matchRoute("/blog/$category/$slug", "/blog/tech/rsc")).toEqual({
      category: "tech",
      slug: "rsc",
    });
  });

  it("returns null on a literal-segment mismatch", () => {
    expect(matchRoute("/profile/me", "/profile/123")).toBeNull();
  });

  it("returns null on a segment-count mismatch", () => {
    expect(matchRoute("/profile/$id", "/profile/123/extra")).toBeNull();
    expect(matchRoute("/a/b", "/a")).toBeNull();
  });

  it("percent-decodes param values", () => {
    expect(matchRoute("/u/$name", "/u/a%20b")).toEqual({ name: "a b" });
  });

  it("treats a bare $ as a catch-all (rest of path, decoded)", () => {
    expect(matchRoute("/files/$", "/files/a/b/c.png")).toEqual({ _splat: "a/b/c.png" });
  });

  it("matches an empty tail for a catch-all", () => {
    expect(matchRoute("/files/$", "/files")).toEqual({ _splat: "" });
  });
});

describe("matchRoutes (specificity ordering)", () => {
  const patterns = [
    "/",
    "/profile/$id",
    "/profile/me",
    "/blog/$category/$slug",
    "/files/$",
  ] as const;

  it("prefers a static segment over a param", () => {
    expect(matchRoutes(patterns, "/profile/me")).toEqual({
      pattern: "/profile/me",
      params: {},
    });
    expect(matchRoutes(patterns, "/profile/123")).toEqual({
      pattern: "/profile/$id",
      params: { id: "123" },
    });
  });

  it("falls through to the catch-all only when nothing else matches", () => {
    expect(matchRoutes(patterns, "/files/a/b")).toEqual({
      pattern: "/files/$",
      params: { _splat: "a/b" },
    });
  });

  it("returns null when no pattern matches", () => {
    expect(matchRoutes(patterns, "/nope/x")).toBeNull();
  });

  // A malformed %-escape in an attacker-controlled url must not throw a URIError
  // (matched on the request thread, incl. the edge handler outside a try).
  it("does not throw on a malformed percent-encoded segment", () => {
    expect(() => matchRoute("/profile/$id", "/profile/%zz")).not.toThrow();
    expect(matchRoute("/profile/$id", "/profile/%zz")).toEqual({ id: "%zz" });
    expect(() => matchRoutes(patterns, "/files/%E0%A4%A")).not.toThrow();
    expect(matchRoute("/profile/$id", "/profile/%41")).toEqual({ id: "A" });
  });
});
