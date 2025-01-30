import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  ssr: {
    noExternal: true,
  },
  build: {
    minify: false,
    target: "es2020",
    
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
        'acorn-loose',
        'webpack-sources',
        'stream',
        'util',
        'crypto',
        'async_hooks',
        'fs',
        'path',
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