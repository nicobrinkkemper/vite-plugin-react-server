import { ModuleGraph, type Manifest } from "vite";
import {
  collectManifestCss,
  collectModuleGraphCss,
} from "../collect-css-manifest.js";

type BaseCssLoaderOptions = {
  /** callback to add css files to the stream */
  onCssFile: (css: string) => void;
  /** loader to load the module */
  loader: (id: string) => Promise<Record<string, any>>;
  /** url of the page */
  url: string;
  /** manually provided css files to add */
  cssFiles: string[];
};

type CreateCssLoaderOptions =
  | (BaseCssLoaderOptions & {
      /** manifest to collect css from */
      manifest: Manifest;
      /** when manifest is given, moduleGraph is not needed */
      moduleGraph?: never;
    })
  | (BaseCssLoaderOptions & {
      /** when moduleGraph is given, manifest is not needed, manual cssFiles can still be provided */
      manifest?: never;
      /** when moduleGraph is given, manifest is not needed, manual cssFiles can still be provided */
      moduleGraph: ModuleGraph;
    });

/**
 * create a loader that can be used to load css files from a manifest or a moduleGraph
 * @param options
 * @returns
 */
export async function createCssLoader(options: CreateCssLoaderOptions) {
  const root = process.cwd();

  const cssModules = new Set<string>();

  if (!(options.manifest || options.moduleGraph))
    throw new Error("Missing manifest or moduleGraph, pass it to options.");

  const getCss = options.manifest
    ? (id: string) =>
        collectManifestCss(
          options.manifest,
          root,
          id,
          options.onCssFile
        )
    : (id: string) => collectModuleGraphCss(options.moduleGraph!, id, options.onCssFile);

  const loadWithCss = async (id: string) => {
    if (!id) return {};

    try {
      const mod = await options.loader(id);
      const pageCss = await Promise.resolve(getCss(id));
      Array.from(pageCss.keys()).forEach((css) => cssModules.add(css));
      return mod as Record<string, any>;
    } catch (e: any) {
      if (e.message?.includes("module runner has been closed")) {
        return { type: "skip" } as Record<string, any>;
      } else {
        return { type: "error", error: e } as Record<string, any>;
      }
    }
  };

  return loadWithCss;
}
