import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    minify: false,
    target: "esnext",
    // already taken care of by rm -rf dist before tsc, and we don't want to remove the .d.ts files
    // this avoids the @rollup/plugin-typescript for re-adding them (You can technically leave out this entire vite build step, it 
    // should work with tsc (I might remove this step in the future, as vite is more browser oriented than node library oriented
    // you need to fight it to not try and externalize things for the browser)
    emptyOutDir: false,
    lib: {
      entry: {
        "client": resolve(__dirname, 'client.ts'),
        "server": resolve(__dirname, 'server.ts'),
        "index": resolve(__dirname, 'index.ts'),
        'plugin/react-client/plugin': resolve(__dirname, 'plugin/react-client/plugin.ts'),
        'plugin/react-server/plugin': resolve(__dirname, 'plugin/react-server/plugin.ts'),
        'plugin/worker/html/index': resolve(__dirname, 'plugin/worker/html/index.ts'),
        'plugin/worker/rsc/index': resolve(__dirname, 'plugin/worker/rsc/index.ts'),
        'plugin/worker/loader': resolve(__dirname, 'plugin/worker/loader.ts'),
        'plugin/preserver/plugin': resolve(__dirname, 'plugin/preserver/plugin.ts'),
        'plugin/transformer/plugin': resolve(__dirname, 'plugin/transformer/plugin.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vite',
        'vitest',
        'rollup',
        'react',
        'react-dom',
        'react-dom/server',
        'react-server-dom-esm',
        'react-server-dom-esm/client.node',
        'react-server-dom-esm/server.node',
        'react-server-dom-esm/node-loader',
        'source-map',
        'acorn-loose',
        'webpack-sources',
        'stream',
        'util',
        'crypto',
        'async_hooks',
        'fs',
        'path',
        'worker_threads',
        'ts-node',
        '@jridgewell/sourcemap-codec',
        // if we use node: paths in our code, it should always be catched by below rule.
        /^node:.*/,
      ],
      output: {
        dir: 'dist',
        exports: 'named',
        preserveModules: true,
        esModule: true,
        compact: false,
        banner: '/**\n * vite-plugin-react-server\n * Copyright (c) Nico Brinkkemper\n * MIT License\n */',
      }
    },
    sourcemap: true,
    // Preserve module structure for proper tree-shaking
    modulePreload: false,  },
});