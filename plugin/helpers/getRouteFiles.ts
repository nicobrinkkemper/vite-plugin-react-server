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
  userOptions: ResolvedUserOptions
): Promise<GetRouteFilesSuccess | GetRouteFilesError> => {
  if (autoDiscoveredFiles.urlMap.has(route)) {
    const { page, props } = autoDiscoveredFiles.urlMap.get(route)!;
    return { type: "success", page, props };
  }
  const { type, error, Page } = await resolveUrlOption(
    userOptions,
    "Page",
    route
  );
  if(type === "error") {
    return { type: "error", error };
  }
  if (!userOptions.props) {
    return { type: "success", page: Page, props: undefined };
  }
  const {
    type: propsType,
    error: propsError,
    props,
  } = await resolveUrlOption(userOptions, "props", route);

  if (propsType === "error") {
    return { type: "error", error: propsError };
  }
  return { type: "success", page: Page, props };
};
