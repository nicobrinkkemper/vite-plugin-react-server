import { describe, it, expect } from "vitest";
import {
  canonicalModuleId,
  wrapModuleID,
} from "../../plugin/config/moduleIdContract.js";

/**
 * The join contract: the browser composes `moduleBaseURL + id` by plain
 * concat (upstream React code), so exactly one side may carry the joining
 * slash. Ids are canonicalized ROOTED; the base side (createReactFetcher)
 * strips its trailing slash. Two id conventions existed in the wild — bare
 * ids under moduleBasePath "" and rooted ids under "/" — which is why no
 * base-side-only normalization could serve both.
 */

describe("canonicalModuleId", () => {
  it("roots a bare id", () => {
    expect(canonicalModuleId("components/Link.client-abc.js")).toBe(
      "/components/Link.client-abc.js"
    );
  });

  it("keeps an already-rooted id unchanged", () => {
    expect(canonicalModuleId("/routes/Counter.client-x.js")).toBe(
      "/routes/Counter.client-x.js"
    );
  });

  it("collapses duplicate leading slashes to one", () => {
    expect(canonicalModuleId("//routes/Counter.client-x.js")).toBe(
      "/routes/Counter.client-x.js"
    );
  });

  it("passes absolute URLs through (never composed with moduleBaseURL)", () => {
    expect(canonicalModuleId("https://cdn.example.com/x.js")).toBe(
      "https://cdn.example.com/x.js"
    );
    expect(canonicalModuleId("data:text/javascript,export{}")).toBe(
      "data:text/javascript,export{}"
    );
  });

  it("passes empty input through", () => {
    expect(canonicalModuleId("")).toBe("");
  });
});

describe("wrapModuleID", () => {
  const identity = (id: string) => id;

  it("does NOT root on filename alone — client-ness is directive-only", () => {
    const fn = wrapModuleID(identity);
    expect(fn("components/Link.client.tsx")).toBe("components/Link.client.tsx");
  });

  it("roots client ids detected by the transformer's directive answer", () => {
    const fn = wrapModuleID(identity);
    expect(fn("view/View.tsx", undefined, true)).toBe("/view/View.tsx");
  });

  it("roots client ids detected by a use client directive in source", () => {
    const fn = wrapModuleID(identity);
    expect(fn("lib/widget.tsx", '"use client";\nexport const W = 1;')).toBe(
      "/lib/widget.tsx"
    );
  });

  it("canonicalizes the fn's OUTPUT (hashed built id), detecting on the input", () => {
    const hashing = (id: string) =>
      id.replace(/\.client\.tsx$/, ".client-abc123.js");
    const fn = wrapModuleID(hashing);
    expect(fn("components/Link.client.tsx", undefined, true)).toBe(
      "/components/Link.client-abc123.js"
    );
  });

  it("leaves non-client ids verbatim (server files, node_modules, virtual)", () => {
    const fn = wrapModuleID(identity);
    expect(fn("routes/page.tsx")).toBe("routes/page.tsx");
    expect(fn("node_modules/react/index.js")).toBe(
      "node_modules/react/index.js"
    );
    expect(fn("_virtual/some-module.js")).toBe("_virtual/some-module.js");
  });

  it("is idempotent over an already-canonical fn", () => {
    const fn = wrapModuleID(wrapModuleID(identity));
    expect(fn("components/Link.client.tsx", undefined, true)).toBe(
      "/components/Link.client.tsx"
    );
  });
});
