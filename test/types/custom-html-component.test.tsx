import { describe, it, expect, expectTypeOf } from "vitest";
import React from "react";
import {
  Css,
  type HtmlProps,
  type HtmlComponentType,
} from "vite-plugin-react-server/components";

const Html = ({
  Root,
  cssFiles,
  globalCss,
  pageProps = {},
  Page,
}: HtmlProps) => {
  if (!pageProps.title) {
    pageProps.title = "No title";
  }
  return (
    <html>
      <head>
        <Css cssFiles={globalCss} />
      </head>
      <body>
        <Root
          as={"div"}
          id="root"
          cssFiles={cssFiles}
          Page={Page}
          pageProps={pageProps}
        />
      </body>
    </html>
  );
};

const Html2: HtmlComponentType = ({
  Root,
  cssFiles,
  globalCss,
  pageProps = {},
  Page,
}) => {
  return (
    <html>
      <head>
        <Css cssFiles={globalCss} />
      </head>
      <body>
        <Root
          as={"div"}
          id="root"
          cssFiles={cssFiles}
          Page={Page}
          pageProps={pageProps}
        />
      </body>
    </html>
  );
};

describe("custom html component", () => {
  it("should be a valid html component", () => {
    expectTypeOf(Html).toEqualTypeOf<
      ({
        Root,
        cssFiles,
        globalCss,
        pageProps,
        Page,
      }: HtmlProps) => React.JSX.Element
    >();
  });

  it("should be a valid html component", () => {
    expectTypeOf(Html2).toEqualTypeOf<
      (
        {
          Root,
          cssFiles,
          globalCss,
          pageProps,
          Page,
        }: HtmlProps<
          any,
          boolean | undefined,
          keyof React.JSX.IntrinsicElements | React.JSXElementConstructor<any>,
          React.ReactNode
        >
      ) => React.ReactNode
    >();
  });
});
