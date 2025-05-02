"use strict";

const condition = process.env['NODE_OPTIONS']?.match(/--conditions[= ]react-server/) ? 'server' : 'client'

export const vitePluginReactServer = await import(`./plugin/react-server/plugin.${condition}.js`).then(m => {
  if(!('vitePluginReactServer' in m)){
    throw new Error(`Could not find vitePluginReactServer in ./plugin/react-server/plugin.${condition}.js`);
  }
  return m['vitePluginReactServer']
})

// types
export type * from './plugin/types.js'