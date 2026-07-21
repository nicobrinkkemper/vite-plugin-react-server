"use client";
// Client runtime: flight cache + headless router + React bindings + Link + the
// supplied client entry (startClient). Browser/entry code only.
//
// EXPLICIT named re-exports (not `export *`): a "use client" barrel is turned
// into client references, and the reference transform can only enumerate
// statically-named exports — star re-exports would leave e.g. `Link`
// unresolvable ("not exported by client.js") when a server component imports it.
export { createFlightCache } from "./flightCache.js";
export type {
  FlightCache,
  FlightCacheOptions,
  FlightGetOptions,
} from "./flightCache.js";
export { createRouter } from "./createRouter.js";
export type {
  CreateRouterOptions,
  Router,
  RouterState,
} from "./createRouter.js";
export {
  RouterProvider,
  useLocation,
  useOptionalRouter,
  useParams,
  useRouter,
} from "./router-react.js";
export { Link } from "./link.js";
export type { LinkPrefetch, LinkProps } from "./link.js";
export { startClient } from "./startClient.js";
export type { StartClientOptions } from "./startClient.js";
export type { Register, RegisteredRoutes, ToPath } from "./register.js";
