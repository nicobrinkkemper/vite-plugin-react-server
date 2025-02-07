"use strict";

import type { StreamPluginOptions } from './plugin/types.js';

const isServer = process.env['NODE_OPTIONS']?.match(/--conditions[= ]react-server/)

export const viteReactServer = async (options: StreamPluginOptions)=>{
  if(!isServer){
    return ()=>{}
  } else {
    const module = await import('./server.js')
    return module.reactServerPlugin(options)
  }
}

export const viteReactClient = async (options: StreamPluginOptions)=>{
  if(isServer){
      return ()=>{}
  } else {
    const module = await import('./client.js')
    return module.reactClientPlugin(options)
  }
}

export const viteReactStream = (options: StreamPluginOptions)=>{
  if(isServer){
    return viteReactClient(options)
  } else {
    return viteReactServer(options)
  }
}