import type { StyleCssProps, LinkCssProps } from "../types.js";

export type CreateElementWithReactOptions = {
  HtmlComponent?: React.ComponentType<any> | null | undefined;
  PageComponent?: React.ComponentType<any> | null | undefined;
  RootComponent?: React.ComponentType<any> | null | undefined;
  pageProps?: any;
  moduleBase: string;
  moduleRootPath: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  cssFiles: Map<string, StyleCssProps | LinkCssProps>;
  globalCss: Map<string, StyleCssProps | LinkCssProps>;
  route: string;
  manifest: any;
  projectRoot: string;
  url: string;
  as?: any;
};

export type CreateElementWithReactFN = <
  R extends {
    Fragment: any;
    use: any;
    isValidElement: (element: any) => boolean;
  },
  ReturnType = React.ReactElement,
  Opt extends CreateElementWithReactOptions = CreateElementWithReactOptions
>(
  React: R,
  options: Opt
) => ReturnType;

export const createElementWithReact: CreateElementWithReactFN =
  function _createElementWithReact(
    React,
    {
      HtmlComponent,
      PageComponent,
      RootComponent,
      pageProps,
      moduleBase,
      moduleRootPath,
      moduleBasePath,
      moduleBaseURL,
      cssFiles = new Map(),
      globalCss = new Map(),
      route,
      manifest,
      projectRoot,
      url,
      as = "div",
    }
  ) {
    if (
      HtmlComponent != null &&
      HtmlComponent !== React.Fragment &&
      HtmlComponent !== undefined
    ) {
      return (
        <HtmlComponent
          moduleBase={moduleBase}
          moduleBaseURL={moduleBaseURL}
          moduleBasePath={moduleBasePath}
          moduleRootPath={moduleRootPath}
          projectRoot={projectRoot}
          url={url}
          route={route}
          pageProps={pageProps}
          cssFiles={cssFiles}
          globalCss={globalCss}
          Root={RootComponent}
          manifest={manifest}
          Page={PageComponent}
          as={as}
        />
      ) as never;
    } else if (
      RootComponent != null &&
      RootComponent !== React.Fragment
    ) {
      return (
        <RootComponent
          key={route}
          as={React.Fragment}
          cssFiles={cssFiles}
          pageProps={pageProps}
          Page={PageComponent}
        />
      ) as never;
    } else if (
      PageComponent != null &&
      PageComponent !== React.Fragment
    ) {
      return <PageComponent {...pageProps} /> as never  ;
    }
    return null as never;
  }; 