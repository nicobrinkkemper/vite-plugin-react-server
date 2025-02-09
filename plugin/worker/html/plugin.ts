import type { Plugin } from "vite";
import { resolve } from "path";
import type { ModuleFormat } from 'rollup';
import type { StreamPluginOptions } from "../../types.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { getPluginRoot } from "../../config/getPaths.js";


export function reactHtmlWorkerPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite:react-html-worker",
    config(config) {
      const root = config.root ?? process.cwd();
      const pluginRoot = getPluginRoot();
      const htmlWorkerPath = typeof options.htmlWorkerPath === 'string' 
        ? resolve(root, options.htmlWorkerPath) 
        : resolve(pluginRoot, DEFAULT_CONFIG.HTML_WORKER_PATH);
      
      const format: ModuleFormat = 'esm';

      // Single worker output for server build
      const workerConfig = {
        input: {
          'html-worker': htmlWorkerPath,
        },
        output: {
          format,
          dir: options.build?.server ?? 'dist/server', // Output to server directory
          entryFileNames: '[name].js',
          preserveModules: true,
          // Add manifest entry
          manualChunks: {
            'html-worker': [htmlWorkerPath]
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
    // Add this to ensure entry is in manifest
    generateBundle(_, bundle) {
      const workerEntry = bundle['html-worker.js'];
      if (workerEntry) {
        Object.defineProperty(workerEntry, 'isEntry', {
          value: true,
          writable: false,
          enumerable: true,
          configurable: false
        });
      }
    }
  };
}
