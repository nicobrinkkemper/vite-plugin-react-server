import type { CreateHandlerOptions } from "../types.js";

export function requestToRoute(
  req: { url?: string },
  handlerOptions: Pick<
    CreateHandlerOptions,
    "moduleBasePath" | "moduleBaseURL" | "build"
  >
) {
  let route = req.url
    ?.replace(
      handlerOptions.moduleBaseURL + handlerOptions.build.rscOutputPath,
      ""
    )
    .replace(
      handlerOptions.moduleBaseURL + handlerOptions.build.htmlOutputPath,
      ""
    )
    .replace(/^\/index$/, "/");
  if (typeof route !== "string") {
    return route;
  }
  
  // Strip moduleBaseURL from the beginning of the route
  if (route.startsWith(handlerOptions.moduleBaseURL)) {
    route = route.slice(handlerOptions.moduleBaseURL.length);
  }
  if(route.endsWith(handlerOptions.build.rscOutputPath)) {
    route = route.slice(0, -handlerOptions.build.rscOutputPath.length);
  }
  
  if (route.startsWith(handlerOptions.moduleBasePath)) {
    route = route.slice(handlerOptions.moduleBasePath.length);
  }

  const routeWithoutTrailingSlash =
    route === "" || route === "/"
      ? "/"
      : route.endsWith("/")
      ? route.slice(0, -1)
      : route;

  const routeWithLeadingSlash = !routeWithoutTrailingSlash
    ? "/"
    : routeWithoutTrailingSlash.startsWith("/")
    ? routeWithoutTrailingSlash
    : `/${routeWithoutTrailingSlash}`;
  return routeWithLeadingSlash;
}
