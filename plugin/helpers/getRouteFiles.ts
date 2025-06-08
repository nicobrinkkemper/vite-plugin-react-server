import type { ResolvedUserOptions } from "../types.js";

import { resolveUrlOption } from "../config/resolveUrlOption.js";
import type { AutoDiscoveredFiles } from "../types.js";

type GetRouteFilesSuccess = {
  type: "success";
  page: string;
  props?: string | undefined;
};

type GetRouteFilesError = {
  type: "error";
  error: Error;
};

export const getRouteFiles = async (
  route: string,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  userOptions: Pick<ResolvedUserOptions, "Page" | "props" | "moduleBasePath" | "verbose">
): Promise<GetRouteFilesSuccess | GetRouteFilesError> => {
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Looking up route:", route);
    console.log("[getRouteFiles] urlMap has route?", autoDiscoveredFiles.urlMap.has(route));
    console.log("[getRouteFiles] urlMap keys:", Array.from(autoDiscoveredFiles.urlMap.keys()));
  }
  
  if (autoDiscoveredFiles.urlMap.has(route)) {
    const { page, props } = autoDiscoveredFiles.urlMap.get(route)!;
    if(userOptions.verbose) {
      console.log("[getRouteFiles] Found in urlMap:", { page, props });
    }
    return { type: "success", page, props };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Not in urlMap, resolving Page option");
  }
  const { type, error, Page } = await resolveUrlOption(
    userOptions,
    "Page",
    route
  );
  if(type === "error") {
    if(userOptions.verbose) {
      console.log("[getRouteFiles] Page resolution error:", error);
    }
    return { type: "error", error };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Page resolved to:", Page);
  }
  if (!userOptions.props) {
    if(userOptions.verbose) {
      console.log("[getRouteFiles] No props option, returning page only");
    }
    autoDiscoveredFiles.urlMap.set(route, { page: Page, props: undefined });
    return { type: "success", page: Page, props: undefined };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Resolving props option");
  }
  const {
    type: propsType,
    error: propsError,
    props,
  } = await resolveUrlOption(userOptions, "props", route);

  if (propsType === "error") {
    if(userOptions.verbose) {
      console.log("[getRouteFiles] Props resolution error:", propsError);
    }
    return { type: "error", error: propsError };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Props resolved to:", props);
  }
  autoDiscoveredFiles.urlMap.set(route, { page: Page, props });
  return { type: "success", page: Page, props };
};
