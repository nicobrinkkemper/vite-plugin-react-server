"use strict";

import { getCondition } from './plugin/config/getCondition.js';
import type { VitePluginMainFn, VitePluginReactClientFn } from './types.js';

// we don't have to check for the "react-client" condition here, since we don't rely on it and it's a not a thing anyway
// it's made-up by this plugin to offer a clear distinction between the client and server conditions

const condition = getCondition('');
const dir = new URL(".", import.meta.url).pathname;

export const { vitePluginReactClient, vitePluginReactServer } = (await import(
  `${dir}/plugin/plugin.${condition}.js`
)) as { vitePluginReactClient: VitePluginReactClientFn, vitePluginReactServer: VitePluginMainFn   };
export * from './plugin/react-client/index.js'
// Export specific dev-server functions for client usage
export { handleRscStream, handleServerAction } from './plugin/dev-server/index.js'
// types
export type * from './plugin/types.js'
export type * from './plugin/react-client/types.js'