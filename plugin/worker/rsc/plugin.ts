import type { Plugin } from "vite";
import { resolve } from "path";
import type { ModuleFormat } from 'rollup';
import type { StreamPluginOptions } from "../../types.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { getPluginRoot } from "../../config/getPaths.js";

export function reactRscWorkerPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite:react-rsc-worker",
    config(config) {
      const root = config.root ?? process.cwd();
      const pluginRoot = getPluginRoot();
      const rscWorkerPath = typeof options.rscWorkerPath === 'string' 
        ? resolve(root, options.rscWorkerPath) 
        : resolve(pluginRoot, DEFAULT_CONFIG.RSC_WORKER_PATH);
      
      const format: ModuleFormat = 'esm';

      // Single worker output for server build
      const workerConfig = {
        input: {
          'rsc-worker': rscWorkerPath,
        },
        output: {
          format,
          dir: options.build?.server ?? 'dist/server', // Output to server directory
          entryFileNames: '[name].js',
          preserveModules: true,
          manualChunks: {
            'rsc-worker': [rscWorkerPath]
          },
          resolve: {
            conditions: ['react-server'],
          }
        }
      };

      return {
        build: {
          rollupOptions: {
            preserveEntrySignatures: 'strict',
            input: {
              ...workerConfig.input,
              ...(typeof config.build?.rollupOptions?.input === 'object' 
                ? config.build?.rollupOptions?.input 
                : {}),
            },
            external: [
              'vite',
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
              // if we use node: paths in our code, it should always be catched by below rule.
              /^node:.*/,
            ],
            output: {
              ...workerConfig.output,
            }
          },
          manifest: true, // Ensure manifest is generated
          minify: false,
          sourcemap: true,
        }
      };
    },
  };
}
