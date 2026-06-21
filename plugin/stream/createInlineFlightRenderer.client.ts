/**
 * createInlineFlightRenderer.client.ts
 *
 * react-client condition barrel. Serving a route with inline flight from a
 * react-client process means RSC must be produced in an rsc-worker (the RSC
 * server renderer isn't available under this condition) and HTML rendered in the
 * main thread — the inverse of the react-server path. That serving model is much
 * less common than running the prod server under `--conditions react-server`
 * (RSC in-process + html-worker), and isn't implemented yet.
 *
 * This barrel keeps the export import-safe under react-client (no react-server-only
 * imports) and fails with an actionable message instead of a confusing crash.
 */
import { assertNonReactServer } from "../config/getCondition.js";
import type { CreateInlineFlightRendererFn } from "./createInlineFlightRenderer.types.js";

export type {
  InlineFlightRendererConfig,
  RenderRouteOptions,
  InlineFlightRenderer,
  InlineFlightHtmlStream,
  CreateInlineFlightRendererFn,
} from "./createInlineFlightRenderer.types.js";

assertNonReactServer();

export const createInlineFlightRenderer: CreateInlineFlightRendererFn =
  function _createInlineFlightRendererClient() {
    throw new Error(
      "createInlineFlightRenderer is only implemented for the react-server serving " +
        "condition (RSC in-process + html-worker). This process is running under the " +
        "react-client condition. Run your production server with " +
        "NODE_OPTIONS='--conditions react-server' to serve dynamic routes with inline flight."
    );
  };
