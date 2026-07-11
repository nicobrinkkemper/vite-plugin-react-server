import { describe, expect, it } from "vitest";
import {
  matchRoute,
  matchRoutes,
  normalizePathForMatch,
  orderPatterns,
  patternProbeUrl,
} from "../../plugin/router/matchRoute.js";

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

describe("patternProbeUrl (build-time module resolution)", () => {
  it("replaces each dynamic segment with a placeholder", () => {
    expect(patternProbeUrl("/profile/$id")).toBe("/profile/__vprs_dyn__");
    expect(patternProbeUrl("/blog/$category/$slug")).toBe(
      "/blog/__vprs_dyn__/__vprs_dyn__",
    );
  });

  // A catch-all sibling of a same-prefix named param must probe to a url that
  // ONLY the catch-all matches — otherwise the more-specific `$name` route wins
  // the probe and the catch-all bakes the wrong module (and its own is never
  // built). The padded probe resolves each pattern to ITSELF.
  it("disambiguates a catch-all from a named-param sibling", () => {
    const patterns = ["/files/$name", "/files/$"] as const;
    const catchAllProbe = patternProbeUrl("/files/$", patterns);
    const namedProbe = patternProbeUrl("/files/$name", patterns);
    expect(matchRoutes(patterns, catchAllProbe)?.pattern).toBe("/files/$");
    expect(matchRoutes(patterns, namedProbe)?.pattern).toBe("/files/$name");
  });

  it("pads a catch-all past the longest named pattern", () => {
    const patterns = ["/blog/$category/$slug", "/blog/$"] as const;
    expect(matchRoutes(patterns, patternProbeUrl("/blog/$", patterns))?.pattern).toBe(
      "/blog/$",
    );
    expect(
      matchRoutes(patterns, patternProbeUrl("/blog/$category/$slug", patterns))
        ?.pattern,
    ).toBe("/blog/$category/$slug");
  });
});

describe("normalizePathForMatch", () => {
  it("drops the query string", () => {
    expect(normalizePathForMatch("/profile/42?ref=x")).toBe("/profile/42");
  });

  it("drops the .rsc transport suffix", () => {
    expect(normalizePathForMatch("/profile/42.rsc")).toBe("/profile/42");
  });

  it("drops a trailing slash but keeps root", () => {
    expect(normalizePathForMatch("/profile/42/")).toBe("/profile/42");
    expect(normalizePathForMatch("/")).toBe("/");
  });

  it("honors a custom rsc suffix", () => {
    expect(normalizePathForMatch("/p/42.flight", ".flight")).toBe("/p/42");
  });
});

describe("orderPatterns", () => {
  it("orders literal > param > catch-all", () => {
    expect([...orderPatterns(["/$", "/$id", "/about"])]).toEqual([
      "/about",
      "/$id",
      "/$",
    ]);
  });

  it("caches the order by content, not array identity", () => {
    // Per-request callers mint a fresh array each time
    // (createSerializableHandlerOptions' `[...routePatterns]`), so the old
    // identity-keyed WeakMap never hit and re-sorted every request. Content
    // keying returns the same cached order for two distinct-but-equal arrays.
    const a = ["/$id", "/about", "/$"];
    const b = ["/$id", "/about", "/$"];
    expect(a).not.toBe(b);
    const first = orderPatterns(a);
    const second = orderPatterns(b);
    expect(second).toBe(first);
  });
});
