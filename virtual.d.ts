/// <reference path="./plugin/types/virtual-rsc-hmr.d.ts" />

// Type declarations for virtual modules and custom events provided by vite-plugin-react-server.
//
// To enable, add to your tsconfig.json:
//   "types": ["vite/client", "vite-plugin-react-server/virtual"]
//
// This provides:
// - Type support for `virtual:react-server/hmr` (useRscHmr, setupRscHmr)
// - Typed custom HMR event: `vite-plugin-react-server:server-component-update`
//   (augments Vite's CustomEventMap for import.meta.hot.on() / hot.send())
// - ImportMetaEnv augmentation for PUBLIC_ORIGIN

declare global {
  interface ImportMetaEnv {
    readonly PUBLIC_ORIGIN: string;
  }
}

export {};
