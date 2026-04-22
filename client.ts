"use strict";


// In client entry, we only import the client plugin
// Server plugin requires react-server condition which isn't available here
export { vitePluginReactServer } from "./plugin/plugin.client.js"


export * from './plugin/react-client/index.client.js'
// Export specific dev-server functions for client usage
export { handleServerAction } from './plugin/dev-server/index.client.js'
export { handleRscStream } from './plugin/stream/index.client.js'
// types
export type * from './plugin/types.js'
export type * from './plugin/react-client/types.js'