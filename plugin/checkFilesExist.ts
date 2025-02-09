import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { CheckFilesExistReturn, StreamPluginOptions } from "./types.js";
import { DEFAULT_CONFIG } from "./config/defaults.js";

export async function checkFilesExist(
  pages: string[],
  options: Pick<StreamPluginOptions, "Page" | "props">,
  root: string
): Promise<CheckFilesExistReturn> {
  const errors: string[] = [];
  const pageSet = new Set<string>();
  const pageMap = new Map<string, string>();
  
  const toKey = (path: string) => {
    return relative(root, resolve(root, path))
      .replace(/\\/g, '/')
      .replace(DEFAULT_CONFIG.FILE_REGEX, '')
      .replace(/^\.\//, '');
  }
  // Check if files exist when string paths are provided
  if (typeof options.Page === "string") {
    const pagePath = options.Page;
    const fullPagePath = resolve(root, pagePath);
    const key = toKey(pagePath);
    pageMap.set(key, pagePath);
    if (!pageSet.has(key)) {
      if (!existsSync(fullPagePath)) {
        errors.push(`Page file not found: ${pagePath}, ${fullPagePath}`);
      }
      pageSet.add(pagePath.replace(/^\//, ''));
    }
  } else if (typeof options.Page === "function" && pages) {
    for (const page of pages) {
      const pagePath = options.Page(page);
      const fullPagePath = resolve(root, pagePath);
      const key = toKey(pagePath);
      pageMap.set(key, pagePath);
      if (pageSet.has(key)) {
        continue;
      }
      if (!existsSync(fullPagePath)) {
        errors.push(`Page file not found: ${pagePath}, ${fullPagePath}`);
      }
      pageSet.add(pagePath);
    }
  }

  const propsSet = new Set<string>();
  const propsMap = new Map<string, string>();
  if (typeof options.props === "string") {
    const propsPath = options.props;
    const fullPropsPath = resolve(root, propsPath);
    const key = toKey(propsPath);
    propsMap.set(key, propsPath);
    if (!propsSet.has(key)) {
      if (!existsSync(fullPropsPath)) {
        errors.push(`Props file not found: ${propsPath}, ${fullPropsPath}`);
      }
      propsSet.add(propsPath);
    }
  } else if (typeof options.props === "function" && pages) {
    for (const page of pages) {
      const propsPath = options.props(page);
      const fullPropsPath = resolve(root, propsPath);
      const key = toKey(propsPath);
      propsMap.set(key, propsPath);
      if (propsSet.has(key)) {
        continue;
      }
      if (!existsSync(fullPropsPath)) {
        errors.push(`Props file not found: ${propsPath}, ${fullPropsPath}`);
      }
      propsSet.add(propsPath);
    }
  }

  if (errors.length) {
    console.warn("React Stream Plugin Validation:\n" + errors.join("\n"));
  }
  return { pageMap, pageSet, propsMap, propsSet };
}
