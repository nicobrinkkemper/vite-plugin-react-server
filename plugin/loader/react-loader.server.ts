import type { LoaderContext } from "../types.js";
import type { ModuleInfo } from "rollup";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";

export interface LoaderOptions {
  id: string;
  resolveDependencies?: boolean;
  format?: string;
  conditions?: string[];
  importAssertions?: Record<string, any>;
  importAttributes?: Record<string, any>;
  source: string;
}

export type LoaderFunction = (options: LoaderOptions) => Promise<ModuleInfo>;

export async function load(url: string, context: LoaderContext, nextLoad: any) {
  const { format } = context;

  if (format === "module") {
    const result = await nextLoad(url, context);
    const transformed = await _transformModuleIfNeeded(result.source, url);
    return { source: transformed };
  }

  return nextLoad(url, context);
}

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  return nextResolve(specifier, context);
}

async function _transformModuleIfNeeded(source: string, url: string) {
  return transformModuleIfNeeded(
    source,
    url,
    true // isServerEnvironment
  );
}
export { _transformModuleIfNeeded as transformModuleIfNeeded };
