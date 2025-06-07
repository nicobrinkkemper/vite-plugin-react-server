"use strict";

// we don't have to check for the "react-client" condition here, since we don't rely on it and it's a not a thing anyway
// it's made-up by this plugin to offer a clear distinction between the client and server conditions

export { vitePluginReactServer as vitePluginReactClient } from './plugin/plugin.client.js'
export { createWorkerStream } from './plugin/react-client/createWorkerStream.js'
// types
export type * from './plugin/types.js'