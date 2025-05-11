import type { CreateHandlerOptions } from "../types.js";

export function requestToRoute(
  req: {url?: string},
  handlerOptions: Pick<CreateHandlerOptions, "moduleBasePath" | "build">
) {
  let route = req.url?.replace("/" + handlerOptions.build.rscOutputPath, "");
  if (typeof route !== "string") {
    return route;
  }
  if (
    route.startsWith(handlerOptions.moduleBasePath)
  ) {
    route = route.slice(handlerOptions.moduleBasePath.length);
  }
  if (!route || route === "") {
    route = "/";
  }
  if (!route.startsWith("/")) {
    route = "/" + route;
  }
  return route;
}
