"use strict";

const condition = process.env['NODE_OPTIONS']?.match(/--conditions[= ]react-server/) ? 'server' : 'client'

if(condition !== 'server'){
  throw new Error('Condition mismatch, should be react-server but got ' + condition);
}

export * from './plugin/plugin.server.js'
export * from './plugin/react-server/index.js'

// types
export type * from './plugin/types.js'
export type * from './plugin/react-server/types.js'