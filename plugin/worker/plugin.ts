import type { Plugin, UserConfig } from "vite";
import { resolve } from "path";
import type { ModuleFormat } from 'rollup';
import type { StreamPluginOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export function reactWorkerPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite:react-worker",
    config(config) {
      const root = config.root ?? process.cwd();
      const htmlWorkerPath = options.htmlWorkerPath ?? DEFAULT_CONFIG.HTML_WORKER_PATH;
      const rscWorkerPath = options.rscWorkerPath ?? DEFAULT_CONFIG.RSC_WORKER_PATH;
      
      const format: ModuleFormat = 'esm';

      // HTML Worker (Development)
      const devHtmlWorker = {
        mode: 'development',
        input: {
          'html-worker.development': htmlWorkerPath,
        },
        output: {
          entryFileNames: '[name].js',
          format,
        },
        define: {
          'process.env.NODE_ENV': JSON.stringify('development'),
          'process.env.NODE_OPTIONS': JSON.stringify(''),
        }
      };
      // HTML Worker (Production)
      const prodHtmlWorker = {  
        mode: 'production',
        input: {
          'html-worker.production': htmlWorkerPath,
        },
        output: {
          entryFileNames: '[name].js',
          format,
        },
        define: {
          'process.env.NODE_ENV': JSON.stringify('production'),
          'process.env.NODE_OPTIONS': JSON.stringify(''),
        }
      };

      // RSC Worker (Development)
      const devRscWorker = {
        mode: 'development',
        input: {
          'rsc-worker.development': rscWorkerPath,
        },
        output: {
          entryFileNames: '[name].js',
          format,
        },
        define: {
          'process.env.NODE_ENV': JSON.stringify('development'),
          'process.env.NODE_OPTIONS': JSON.stringify('--conditions=react-server'),
        }
      };
      // RSC Worker (Production)
      const prodRscWorker = {
        mode: 'production',
        input: {
          'rsc-worker.production': rscWorkerPath,
        },
        output: {
          entryFileNames: '[name].js',
          format,
        },
        define: {
          'process.env.NODE_ENV': JSON.stringify('production'),
          'process.env.NODE_OPTIONS': JSON.stringify('--conditions=react-server'),
        }
      };
      return {
        build: {
          rollupOptions: {
            // Build both dev and prod versions
            input: {
              ...devHtmlWorker.input,
              ...prodHtmlWorker.input,
              ...devRscWorker.input,
              ...prodRscWorker.input,
            },
            output: [
              {
                ...devHtmlWorker.output,
                ...devRscWorker.output,
                ...prodHtmlWorker.output,
                ...prodRscWorker.output,
                // Only include dev entries
                preserveModules: true,
                entryFileNames: (chunk) => {
                  return chunk.name.includes('.development') 
                    ? '[name].js'
                    : '[name].[hash].js';
                }
              },
              {
                ...prodHtmlWorker.output,
                // Only include prod entries
                preserveModules: true,
                entryFileNames: (chunk) => {
                  return chunk.name.includes('.production') 
                    ? '[name].js'
                    : '[name].[hash].js';
                }
              }
            ]
          },
          minify: false,
          sourcemap: true,
        }
      };
    },
  };
}
