"use strict";

const condition = process.env['NODE_OPTIONS']?.match(/--conditions[= ]react-server/) ? 'server' : 'client'

if(condition !== 'server'){
  throw new Error('Condition mismatch, should be react-server but got ' + condition);
}

export { vitePluginReactServer } from './plugin/plugin.server.js'

// types
export type * from './plugin/types.js'