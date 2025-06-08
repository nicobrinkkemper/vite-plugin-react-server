import type { CreateHandlerOptions } from "../types.js";

export function requestToRoute(
  req: { url?: string },
  handlerOptions: Pick<
    CreateHandlerOptions,
    "moduleBasePath" | "moduleBaseURL" | "build"
  >
) {
  console.log("[requestToRoute] Original URL:", req.url);
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
  console.log("[requestToRoute] After rscOutputPath replace:", route);
  if (typeof route !== "string") {
    return route;
  }
  if (route.startsWith(handlerOptions.moduleBasePath)) {
    route = route.slice(handlerOptions.moduleBasePath.length);
    console.log("[requestToRoute] After moduleBasePath slice:", route);
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
  console.log("[requestToRoute] Final route:", routeWithLeadingSlash);
  return routeWithLeadingSlash;
}
