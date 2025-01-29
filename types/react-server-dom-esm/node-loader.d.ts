
declare module "react-server-dom-esm/node-loader" {
    interface LoadContext {
      format: string;
      conditions?: string[];
      importAssertions?: Record<string, string>;
    }
  
    export function resolve(
      specifier: string,
      context: { conditions: string[]; parentURL?: string },
      defaultResolve: Function
    ): Promise<{ url: string }>;
  
    export function load(
      url: string,
      context: LoadContext,
      defaultLoad: Function
    ): Promise<{ format: string; source: string }>;
  
    export function transformSource(
      source: string,
      context: LoadContext & { url: string },
      defaultTransformSource: Function
    ): Promise<{ source: string }>;
  }