import { register } from "node:module";
import { pathToFileURL } from "node:url";
import type { MessagePort } from "node:worker_threads";
import { readFileSync } from "node:fs";

export type LoaderRegistration = {
  key: string;
  path: string;
  port: MessagePort;
  importMap?: string;
};

export function registerLoaders(loaders: LoaderRegistration[]) {
  for (const { key, path, port, importMap } of loaders) {
    const loaderURL = pathToFileURL(path);
    
    // If import map is provided, register it first
    if (importMap) {
      try {
        const importMapContent = readFileSync(importMap, 'utf-8');
        const { imports } = JSON.parse(importMapContent);
        
        register(loaderURL, {
          parentURL: import.meta.url,
          data: { 
            port,
            resolve: (specifier: string, context: any, nextResolve: any) => {
              if (Object.hasOwn(imports, specifier)) {
                return nextResolve(imports[specifier], context);
              }
              return nextResolve(specifier, context);
            }
          },
          transferList: [port]
        });
      } catch (error) {
        console.error(`Failed to load import map from ${importMap}:`, error);
        // Fallback to basic registration if import map fails
        register(loaderURL, {
          parentURL: import.meta.url,
          data: { port },
          transferList: [port]
        });
      }
    } else {
      // Basic registration without import map
      register(loaderURL, {
        parentURL: import.meta.url,
        data: { port },
        transferList: [port]
      });
    }
  }
} 