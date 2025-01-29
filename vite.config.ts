import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    minify: false,
    target: "node23",
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'react-client/plugin': resolve(__dirname, 'src/react-client/plugin.ts'),
        'react-server/plugin': resolve(__dirname, 'src/react-server/plugin.ts')
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vite',
        'react',
        'react-dom',
        'react-server-dom-esm/client',
        'react-server-dom-esm/client.node',
        'react-server-dom-esm/server.node',
        'react-server-dom-esm/node-loader',
        'acorn-loose',
        'webpack-sources',
        /^node:.*/,
      ],
      output: {
        exports: 'named',
        preserveModules: true,
        esModule: true,
        compact: false,
        banner: '/**\n * vite-plugin-react-server\n * Copyright (c) Nico Brinkkemper\n * MIT License\n */',
      }
    },
    sourcemap: true,
    // Preserve module structure for proper tree-shaking
    modulePreload: false,
    // Don't empty outDir since we need type definitions
    emptyOutDir: false,
  },
  resolve: {
    // Add conditions for RSC
    conditions: ['react-server'],
  },
}); 