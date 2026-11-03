import React from "react";
import { describe, expect, it } from "vitest";
import { Html } from "../../plugin/components/html.js";
import { createElementWithReact } from "../../plugin/helpers/createElementWithReact.js";
import type { HtmlProps } from "../../plugin/types.js";

// The built-in Html is the document every prerendered page gets when the app
// supplies none, so it carries what a page needs on its own: a language and
// a viewport, next to the charset.
const renderHtml = (props: Partial<HtmlProps> = {}) =>
  (Html as (p: HtmlProps) => React.ReactElement)({
    Root: React.Fragment,
    Page: () => null,
    cssFiles: new Map(),
    globalCss: new Map(),
    ...props,
  } as HtmlProps);

const headChildren = (doc: React.ReactElement) => {
  const [head] = React.Children.toArray(
    (doc.props as { children: React.ReactNode }).children,
  ) as React.ReactElement[];
  return React.Children.toArray(
    (head.props as { children: React.ReactNode }).children,
  ) as React.ReactElement<Record<string, string>>[];
};

const viewports = (doc: React.ReactElement) =>
  headChildren(doc).filter(
    (c) => c.type === "meta" && c.props["name"] === "viewport",
  );

describe("default Html", () => {
  it("sets the document language", () => {
    const doc = renderHtml();
    expect(doc.type).toBe("html");
    expect((doc.props as { lang?: string }).lang).toBe("en");
  });

  it("renders charset and a viewport meta", () => {
    const children = headChildren(renderHtml());
    expect(children.some((c) => c.type === "meta" && c.props["charSet"] === "utf-8")).toBe(true);
    const [viewport] = viewports(renderHtml());
    expect(viewport.props["content"]).toBe("width=device-width, initial-scale=1");
  });

  it("leaves the viewport to a route head that sets one", () => {
    const doc = renderHtml({
      head: { meta: [{ name: "viewport", content: "width=1024" }] },
    });
    expect(viewports(doc)).toHaveLength(0);
  });

  it("keeps its viewport when the route head sets other meta", () => {
    const doc = renderHtml({
      head: { meta: [{ name: "description", content: "d" }] },
    });
    expect(viewports(doc)).toHaveLength(1);
  });
});

describe("createElementWithReact hands the route head to Html", () => {
  it("passes the merged head.ts contribution as the head prop", () => {
    const el = createElementWithReact(React as never, {
      PageComponent: (() => null) as never,
      HtmlComponent: Html as never,
      RootComponent: React.Fragment as never,
      pageProps: {} as never,
      layoutChain: [
        { props: {}, head: { meta: [{ name: "viewport", content: "a" }] } },
        { props: {}, head: { meta: [{ name: "viewport", content: "b" }] } },
      ],
    } as never) as React.ReactElement<HtmlProps>;

    expect(el.type).toBe(Html);
    expect(el.props.head?.meta).toEqual([{ name: "viewport", content: "b" }]);
    expect(viewports(renderHtml(el.props))).toHaveLength(0);
  });

  it("passes no head without a layout chain", () => {
    const el = createElementWithReact(React as never, {
      PageComponent: (() => null) as never,
      HtmlComponent: Html as never,
      RootComponent: React.Fragment as never,
      pageProps: {} as never,
    } as never) as React.ReactElement<HtmlProps>;

    expect(el.props.head).toBeUndefined();
  });
});
