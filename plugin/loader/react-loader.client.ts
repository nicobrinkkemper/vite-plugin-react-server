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
    const isServerFunction = result.source?.match(/^"use server"[\s;]*\n?/m);
    const isClientFunction = result.source?.match(/^"use client"[\s;]*\n?/m);
    const transformed = await transformModuleIfNeeded(
      result.source,
      url,
      isServerFunction,
      isClientFunction
    );
    if (!transformed.source) {
      return result;
    }
    return {
      ...result,
      source: transformed.source,
      map: transformed.sourceMap,
    };
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

