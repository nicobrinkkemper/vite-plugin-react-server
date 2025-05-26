import type { LoaderContext } from "../types.js";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";

export type LoaderFunction = (
  source: string,
  url: string,
  isServerEnvironment: boolean,
  isServerModule: boolean,
  isClientModule: boolean,
  loader: (id: string) => Promise<string | null>
) => Promise<string>;

export async function load(url: string, context: LoaderContext, nextLoad: any) {
  const { format } = context;
  if (format === "module") {
    const result = await nextLoad(url, context);
    return _transformModuleIfNeeded(result.source, url);
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
    false, // isServerEnvironment
    true // isClientEnvironmentßß
  );
}
export { _transformModuleIfNeeded as transformModuleIfNeeded };
