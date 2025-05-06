import type { HtmlProps } from "../types.js";

export function createHtmlProps<
  T extends Partial<HtmlProps>
>(htmlProps: T, {
  moduleBase,
  moduleBaseURL,
  moduleBasePath,
  moduleRootPath,
  projectRoot,
  url,
  route,
  pageProps,
  cssFiles,
  rscOutputPath,
  htmlOutputPath,
  manifest,
}: Partial<HtmlProps>): HtmlProps {
  if (htmlProps == null) {
    htmlProps = {} as T;
  }
  if (!("moduleBase" in htmlProps && typeof moduleBase === "string")) {
    htmlProps["moduleBase"] = moduleBase;
  }
  if (!("moduleBaseURL" in htmlProps && typeof moduleBaseURL === "string")) {
    htmlProps["moduleBaseURL"] = moduleBaseURL;
  }
  if (!("moduleBasePath" in htmlProps && typeof moduleBasePath === "string")) {
    htmlProps["moduleBasePath"] = moduleBasePath;
  }
  if (!("moduleRootPath" in htmlProps && typeof moduleRootPath === "string")) {
    htmlProps["moduleRootPath"] = moduleRootPath;
  }
  if (!("projectRoot" in htmlProps && typeof projectRoot === "string")) {
    htmlProps["projectRoot"] = projectRoot;
  }
  if (!("url" in htmlProps && typeof url === "string")) {
    htmlProps["url"] = url;
  }
  if (!("route" in htmlProps && typeof route === "string")) {
    htmlProps["route"] = route;
  }
  if (!("pageProps" in htmlProps && typeof pageProps === "object" && pageProps != null)) {
    htmlProps["pageProps"] = pageProps;
  }
  if (!("cssFiles" in htmlProps && cssFiles != null && cssFiles instanceof Map)) {
    htmlProps["cssFiles"] = cssFiles;
  }
  if (!("rscOutputPath" in htmlProps && typeof rscOutputPath === "string")) {
    htmlProps["rscOutputPath"] = rscOutputPath;
  }
  if (!("htmlOutputPath" in htmlProps && typeof htmlOutputPath === "string")) {
    htmlProps["htmlOutputPath"] = htmlOutputPath;
  }
  if (!("manifest" in htmlProps && typeof manifest === "object" && manifest != null)) {
    htmlProps["manifest"] = manifest;
  }
  return htmlProps as HtmlProps;
}
