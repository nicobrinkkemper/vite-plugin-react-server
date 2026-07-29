import React from "react";
import { describe, expect, it } from "vitest";
import { resolveLayoutChain } from "../../plugin/helpers/resolveLayoutChain.js";
import { createElementWithReact } from "../../plugin/helpers/createElementWithReact.js";
import { redirect } from "../../plugin/router/loaderSignals.js";
import type { RouteLayer } from "../../plugin/router/scanRoutes.js";

// A loader keyed by the `${path}#${export}` id resolvePage/resolveProps
// request; bare ids (head modules) resolve without the suffix.
const makeLoader =
  (modules: Record<string, unknown>) => async (id: string) =>
    (modules[id] ?? {}) as Record<string, unknown>;

const RootLayout = ({ children }: { children?: unknown }) => children;
const Boundary = ({ children }: { children?: unknown }) => children;
const Spinner = () => null;

describe("resolveLayoutChain — boundaries + head", () => {
  const loader = makeLoader({
    "routes/route.tsx#Layout": { Layout: RootLayout },
    "routes/error.tsx#ErrorBoundary": { ErrorBoundary: Boundary },
    "routes/loading.tsx#Loading": { Loading: Spinner },
    "routes/head.ts": {
      head: ({ data }: { data: Record<string, unknown> }) => ({
        title: `t-${data.name}`,
      }),
    },
    "routes/props.ts#props": { props: () => ({ name: "x" }) },
    "routes/redirecting-props.ts#props": {
      props: () => redirect("/login"),
    },
  });

  it("loads error/loading/head onto the layer", async () => {
    const layouts: RouteLayer[] = [
      {
        component: "routes/route.tsx",
        props: "routes/props.ts",
        error: "routes/error.tsx",
        loading: "routes/loading.tsx",
        head: "routes/head.ts",
      },
    ];
    const chain = await resolveLayoutChain({
      layouts,
      url: "/",
      ctx: { params: {} },
      loader,
      layoutExportName: "Layout",
      propsExportName: "props",
    });
    expect(chain).toHaveLength(1);
    expect(chain[0].Component).toBe(RootLayout);
    expect(chain[0].ErrorBoundary).toBe(Boundary);
    expect(chain[0].Loading).toBe(Spinner);
    // Functional head evaluated with the segment's resolved loader data.
    expect(chain[0].head).toEqual({ title: "t-x" });
  });

  it("keeps a boundaries-only layer (no route.tsx)", async () => {
    const chain = await resolveLayoutChain({
      layouts: [{ loading: "routes/loading.tsx" }],
      url: "/",
      ctx: { params: {} },
      loader,
      layoutExportName: "Layout",
      propsExportName: "props",
    });
    expect(chain).toHaveLength(1);
    expect(chain[0].Component).toBeUndefined();
    expect(chain[0].Loading).toBe(Spinner);
  });

  it("propagates a redirect() thrown by a layout loader", async () => {
    await expect(
      resolveLayoutChain({
        layouts: [
          {
            component: "routes/route.tsx",
            props: "routes/redirecting-props.ts",
          },
        ],
        url: "/",
        ctx: { params: {} },
        loader,
        layoutExportName: "Layout",
        propsExportName: "props",
      }),
    ).rejects.toMatchObject({ to: "/login", status: 302 });
  });
});

describe("createElementWithReact — boundary/suspense/head fold", () => {
  const Page = (props: Record<string, unknown>) =>
    React.createElement("main", props);

  it("wraps each segment Layout → ErrorBoundary → Suspense(Loading)", () => {
    const el = createElementWithReact(React as never, {
      PageComponent: Page as never,
      HtmlComponent: React.Fragment as never,
      RootComponent: React.Fragment as never,
      pageProps: {} as never,
      layoutChain: [
        {
          Component: RootLayout,
          props: {},
          ErrorBoundary: Boundary,
          Loading: Spinner,
        },
      ],
    } as never) as React.ReactElement;

    const Composed = el.type as (p: unknown) => React.ReactElement;
    const tree = Composed(el.props);

    expect(tree.type).toBe(RootLayout);
    const boundary = tree.props.children as React.ReactElement;
    expect(boundary.type).toBe(Boundary);
    const suspense = boundary.props.children as React.ReactElement;
    expect(suspense.type).toBe(React.Suspense);
    expect((suspense.props.fallback as React.ReactElement).type).toBe(Spinner);
    const leaf = suspense.props.children as React.ReactElement;
    expect(leaf.type).toBe(Page);
  });

  it("renders merged head tags beside the leaf (leaf title wins)", () => {
    const el = createElementWithReact(React as never, {
      PageComponent: Page as never,
      HtmlComponent: React.Fragment as never,
      RootComponent: React.Fragment as never,
      pageProps: {} as never,
      layoutChain: [
        {
          Component: RootLayout,
          props: {},
          head: {
            title: "root",
            meta: [{ name: "description", content: "d" }],
          },
        },
        { props: {}, head: { title: "leaf" } },
      ],
    } as never) as React.ReactElement;

    const Composed = el.type as (p: unknown) => React.ReactElement;
    const tree = Composed(el.props);

    // Layer 2 has no Component/boundaries — the fragment with head tags +
    // page is directly under the root layout.
    expect(tree.type).toBe(RootLayout);
    const frag = tree.props.children as React.ReactElement;
    expect(frag.type).toBe(React.Fragment);
    const children = React.Children.toArray(
      frag.props.children,
    ) as React.ReactElement[];
    const title = children.find((c) => c.type === "title");
    expect(title?.props.children).toBe("leaf");
    const meta = children.find((c) => c.type === "meta");
    expect(meta?.props.content).toBe("d");
    expect(children.some((c) => c.type === Page)).toBe(true);
  });
});
