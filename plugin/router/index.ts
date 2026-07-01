// File-based routing: config + loader helpers, used in vite.config (fileRouter)
// and route loaders (withParams). Node/config-side and isomorphic-safe — no
// React, so it's condition-agnostic. The client runtime lives in ./client.
export * from "./matchRoute.js";
export * from "./scanRoutes.js";
export * from "./fileRouter.js";
export * from "./withParams.js";
export type { Register, RegisteredRoutes, ToPath } from "./register.js";
