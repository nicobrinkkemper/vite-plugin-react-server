import type { LoaderContext } from "../types.js";
import type { ModuleInfo } from "rollup";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";
import type { MessagePort } from "node:worker_threads";
import type { InitializedReactLoaderMessage, ServerModuleMessage } from "../worker/types.js";
import { hydrateUserOptions } from "../helpers/index.js";
import { resolveOptions } from "../config/index.js";
import { fileURLToPath } from "node:url";

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

let userOptions: any;
let loaderPort: MessagePort | undefined;
export async function initialize(data: { id: string, port: MessagePort, userOptions: any }) {
  userOptions = resolveOptions(hydrateUserOptions(data.userOptions));
  loaderPort = data.port;
  data.port.postMessage({ type: "INITIALIZED_REACT_LOADER", id: data.id } satisfies InitializedReactLoaderMessage);
}

export async function load(url: string, context: LoaderContext, nextLoad: any) {
  const { format } = context;

  if (format === "module") {
    const result = await nextLoad(url, context);
    const source = typeof result.source === 'string' ? result.source : 
                  result.source instanceof Uint8Array ? new TextDecoder().decode(result.source) :
                  String(result.source);
    const isServerFunction = source?.match(/^"use server"[\s;]*\n?/m);
    const isClientFunction = source?.match(/^"use client"[\s;]*\n?/m);

    // Handle file URLs
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;

    // Normalize the URL using the same logic as plugin.server.ts
    let moduleID = filePath;
    let finalID = filePath;
    if (userOptions?.normalizer) {
      const [, value] = userOptions.normalizer(filePath);
      moduleID = value;
      finalID = userOptions.moduleID(moduleID);
    }
    if (userOptions.verbose) {
      console.log("[react-loader] finalID:", finalID);
    }

    const transformed = await transformModuleIfNeeded(
      source,
      filePath,
      finalID,
      isServerFunction,
      isClientFunction
    );
    if (!transformed.source) {
      return result;
    }
    const newSrc = transformed.source;

    if (userOptions.verbose) {
      console.log("[react-loader] Transformed source:", newSrc);
    }

    if (loaderPort) {
      if (userOptions.verbose) {
        console.log("[react-loader] Sending SERVER_MODULE message:", { id: finalID, url: filePath });
      }
      loaderPort.postMessage({
        type: "SERVER_MODULE",
        id: finalID,
        url: filePath,
        source: newSrc,
      } satisfies ServerModuleMessage);
    }

    return {
      ...result,
      source: newSrc,
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
