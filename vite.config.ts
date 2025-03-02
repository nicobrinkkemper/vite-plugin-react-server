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
        'plugin/loader/css-loader': resolve(__dirname, 'plugin/loader/css-loader.ts'),
        'plugin/loader/react-loader': resolve(__dirname, 'plugin/loader/react-loader.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        // Node.js built-ins
        'node:worker_threads',
        'node:path',
        'node:fs',
        'node:fs/promises',
        // Dependencies
        'vite',
        'esbuild',
        'tsx',
        'react',
        'react-dom',
        'react-dom/server',
        'react-server-dom-esm/server.node',
        'react-server-dom-esm/client.node',
        'react-server-dom-esm/node-loader',
        'webpack-sources',
        'webpack-sources/lib/helpers/createMappingsSerializer.js',
        'webpack-sources/lib/helpers/readMappings.js',
        // css
        'symbols',
        'postcss',
        'happy-dom',
        // Add tsx and its dependencies
        'tsx',
        'tsx/esm/api',
        'tsx/source-map-support',
        'tsx/register',
        'vitest',
        'rollup',
        'source-map',
        'acorn-loose',
        'webpack-sources',
        'stream',
        'util',
        'crypto',
        'async_hooks',
        '@jridgewell/sourcemap-codec',
        // if we use node: paths in our code, it should always be catched by below rule.
        /^node:.*/,
        /^_virtual/,
        "path",
        "fs",
        "fs/promises",
        "worker_threads",
        "tsx",
        "tsx/esm/api",
        "rollup",
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