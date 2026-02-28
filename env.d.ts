/**
 * Environment type declarations for vite-plugin-react-server.
 *
 * Add to your project's tsconfig.json:
 *
 *   "types": ["vite-plugin-react-server/env"]
 *
 * Or add a triple-slash reference in any .d.ts file:
 *
 *   /// <reference types="vite-plugin-react-server/env" />
 */

interface ImportMetaEnv {
  readonly PUBLIC_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
