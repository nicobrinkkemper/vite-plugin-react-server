// Client-side aggregator for the public ./helpers subpath under the default
// (react-client) condition. The condition-neutral surface lives in
// index.shared.ts; this file adds the client-only resolveComponentsClient and
// the client side of server-action handling.

export * from "./index.shared.js";

export { resolveComponents as resolveComponentsClient } from "./resolveComponents.client.js";

// Server-action handling. `handleServerAction` means ONE thing across the
// package: the sealed HTTP handler that EXECUTES actions, which only exists
// under the react-server condition (execution needs the react-server React
// build). Under the default condition the name throws with setup guidance
// instead of silently resolving to different behavior with a different
// signature. A process on this side of the condition boundary forwards the
// request instead — that is `delegateServerActionToWorker`.
export {
  handleServerAction,
  delegateServerActionToWorker,
} from "./handleServerAction.client.js";
