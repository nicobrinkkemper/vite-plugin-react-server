import { describe, expect, it } from "vitest";
import { resolvePageAndProps } from "../../plugin/helpers/resolvePageAndProps.js";

// The file router threads params/request into a loader automatically:
// `props(url, { params, request })`, with params derived from routePatterns + url
// (no `withParams` pattern to repeat). These tests exercise that plumbing
// through the canonical resolvePageAndProps helper (the same one dev/static/
// worker/edge call), independent of any built example.

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} } as any;

/** A loader dispatching by base path (ignores the `#export` suffix). */
function makeLoader(propsFn: (url: string, ctx?: any) => unknown) {
  return async (id?: string) => {
    const base = String(id).split("#")[0];
    if (base === "virtual:props") return { props: propsFn };
    return { Page: () => null };
  };
}

describe("resolvePageAndProps — automatic params", () => {
  it("derives params from routePatterns and passes them to the loader", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ({ id: ctx?.params?.id })),
      url: "/profile/42",
      routePatterns: ["/profile/$id"],
      logger: noopLogger,
    });

    expect(result.type).toBe("success");
    expect(result.type === "success" && result.pageProps).toEqual({ id: "42" });
  });

  it("passes the request through to the loader when present", async () => {
    const request = new Request("http://localhost/profile/7", {
      headers: { cookie: "session=abc" },
    });
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ({
        cookie: ctx?.request?.headers.get("cookie") ?? null,
      })),
      url: "/profile/7",
      routePatterns: ["/profile/$id"],
      request,
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({
      cookie: "session=abc",
    });
  });

  it("gives the loader empty params when nothing matches", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ({ params: ctx?.params })),
      url: "/nope",
      routePatterns: ["/profile/$id"],
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({ params: {} });
  });

  it("prefers precomputed params over routePatterns", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ctx?.params),
      url: "/profile/42",
      routePatterns: ["/profile/$id"],
      params: { id: "override" },
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({
      id: "override",
    });
  });

  it("stays back-compatible with a plain (url) => props loader", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((url) => ({ url })),
      url: "/profile/42",
      routePatterns: ["/profile/$id"],
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({
      url: "/profile/42",
    });
  });

  it("passes multiple params (most-specific pattern wins)", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ctx?.params),
      url: "/blog/tech/rsc",
      routePatterns: ["/blog/$category/$slug", "/blog/$category/me"],
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({
      category: "tech",
      slug: "rsc",
    });
  });

  it("exposes a catch-all's _splat to the loader", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ({ splat: ctx?.params?._splat })),
      url: "/files/a/b/c.png",
      routePatterns: ["/files/$"],
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({
      splat: "a/b/c.png",
    });
  });

  it("normalizes the match target: query, index.rsc suffix, trailing slash", async () => {
    for (const url of [
      "/profile/42?ref=x",
      "/profile/42/index.rsc",
      "/profile/42/",
      "/profile/42.html",
    ]) {
      const result = await resolvePageAndProps({
        pagePath: "virtual:page",
        propsPath: "virtual:props",
        propsExportName: "props",
        loader: makeLoader((_url, ctx) => ctx?.params),
        url,
        routePatterns: ["/profile/$id"],
        build: { rscOutputPath: "index.rsc" },
        logger: noopLogger,
      });
      expect(result.type === "success" && result.pageProps, `for ${url}`).toEqual({
        id: "42",
      });
    }
  });

  it("leaves request undefined on the non-request paths (worker/static)", async () => {
    const result = await resolvePageAndProps({
      pagePath: "virtual:page",
      propsPath: "virtual:props",
      propsExportName: "props",
      loader: makeLoader((_url, ctx) => ({
        hasRequest: ctx?.request !== undefined,
      })),
      url: "/profile/42",
      routePatterns: ["/profile/$id"],
      logger: noopLogger,
    });

    expect(result.type === "success" && result.pageProps).toEqual({
      hasRequest: false,
    });
  });
});
