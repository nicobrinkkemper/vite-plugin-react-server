"use strict";


// In client entry, we only import the client plugin
// Server plugin requires react-server condition which isn't available here
export { vitePluginReactServer } from "./plugin/plugin.client.js"


export * from './plugin/react-client/index.js'
// Export specific dev-server functions for client usage
export { handleServerAction } from './plugin/dev-server/index.js'
export { handleRscStream } from './plugin/stream/index.js'
// types
export type * from './plugin/types.js'
export type * from './plugin/react-client/types.js'