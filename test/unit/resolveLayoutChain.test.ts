import React from "react";
import { describe, expect, it } from "vitest";
import { resolveLayoutChain } from "../../plugin/helpers/resolveLayoutChain.js";
import { createElementWithReact } from "../../plugin/helpers/createElementWithReact.js";
import type { RouteLayer } from "../../plugin/router/scanRoutes.js";

// A loader keyed by the `${path}#${export}` id resolvePage/resolveProps request.
const makeLoader = (modules: Record<string, unknown>) => async (id: string) =>
  modules[id] ?? {};

const RootLayout = ({ children }: { children?: unknown }) => children;
const BlogLayout = ({ children }: { children?: unknown }) => children;

describe("resolveLayoutChain", () => {
  const layouts: RouteLayer[] = [
    { component: "routes/route.tsx" },
    { component: "routes/blog/route.tsx", props: "routes/blog/props.ts" },
  ];
  const loader = makeLoader({
    "routes/route.tsx#Layout": { Layout: RootLayout },
    "routes/blog/route.tsx#Layout": { Layout: BlogLayout },
    // Loader-form props: receives (url, { params, request }).
    "routes/blog/props.ts#props": {
      props: (_url: string, ctx: { params: Record<string, string> }) => ({
        section: "blog",
        slug: ctx.params.slug,
      }),
    },
  });

  it("resolves components + props in root→leaf order", async () => {
    const chain = await resolveLayoutChain({
      layouts,
      url: "/blog/rsc",
      ctx: { params: { slug: "rsc" } },
      loader,
      layoutExportName: "Layout",
      propsExportName: "props",
    });
    expect(chain).toHaveLength(2);
    expect(chain[0].Component).toBe(RootLayout);
    expect(chain[0].props).toEqual({}); // no props.ts on the root layer
    expect(chain[1].Component).toBe(BlogLayout);
    // Loader ran with the matched params threaded in.
    expect(chain[1].props).toMatchObject({ section: "blog", slug: "rsc" });
  });

  it("skips a layer whose route.tsx has no Layout export", async () => {
    const chain = await resolveLayoutChain({
      layouts: [{ component: "routes/route.tsx" }, { component: "missing.tsx" }],
      url: "/",
      ctx: { params: {} },
      loader,
      layoutExportName: "Layout",
      propsExportName: "props",
    });
    expect(chain).toHaveLength(1);
    expect(chain[0].Component).toBe(RootLayout);
  });

  it("returns [] for an unwrapped page", async () => {
    expect(
      await resolveLayoutChain({
        layouts: [],
        url: "/",
        ctx: { params: {} },
        loader,
        layoutExportName: "Layout",
        propsExportName: "props",
      })
    ).toEqual([]);
  });
});

describe("createElementWithReact — layout fold", () => {
  const Page = (props: Record<string, unknown>) =>
    React.createElement("main", props);
  const L0 = ({ children }: { children?: unknown }) => children;
  const L1 = ({ children }: { children?: unknown }) => children;

  it("folds the chain root→leaf around the leaf page (Page-only branch)", () => {
    const el = createElementWithReact(React as never, {
      PageComponent: Page as never,
      HtmlComponent: React.Fragment as never,
      RootComponent: React.Fragment as never,
      pageProps: { id: "42" } as never,
      layoutChain: [
        { Component: L0, props: { a: 1 } },
        { Component: L1, props: { b: 2 } },
      ],
    } as never) as React.ReactElement;

    // Page-only branch returns <ComposedPage {...pageProps}/>; invoke it to
    // materialize the folded tree.
    const Composed = el.type as (p: unknown) => React.ReactElement;
    const tree = Composed(el.props);

    // Outermost is L0, then L1, then the leaf Page with its own props.
    expect(tree.type).toBe(L0);
    expect(tree.props.a).toBe(1);
    const inner = tree.props.children as React.ReactElement;
    expect(inner.type).toBe(L1);
    expect(inner.props.b).toBe(2);
    const leaf = inner.props.children as React.ReactElement;
    expect(leaf.type).toBe(Page);
    expect(leaf.props.id).toBe("42");
  });

  it("passes the leaf page through unchanged when there is no chain", () => {
    const el = createElementWithReact(React as never, {
      PageComponent: Page as never,
      HtmlComponent: React.Fragment as never,
      RootComponent: React.Fragment as never,
      pageProps: { id: "7" } as never,
    } as never) as React.ReactElement;
    expect(el.type).toBe(Page);
    expect(el.props.id).toBe("7");
  });
});
