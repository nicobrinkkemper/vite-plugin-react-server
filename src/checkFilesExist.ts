import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { StreamPluginOptions } from "./types.js";

export async function checkFilesExist(
  pages: string[],
  options: Pick<StreamPluginOptions, "Page" | "props">,
  root: string
) {
  const errors: string[] = [];
  const pageSet = new Set<string>();
  const pageMap = new Map<string, string>();
  // Check if files exist when string paths are provided
  if (typeof options.Page === "string") {
    const pagePath = resolve(root, options.Page);
    pageMap.set(options.Page, pagePath);
    if (!pageSet.has(pagePath)) {
      if (!existsSync(pagePath)) {
        errors.push(`Page file not found: ${pagePath}`);
      }
      pageSet.add(pagePath);
    }
  } else if (typeof options.Page === "function" && pages) {
    for (const page of pages) {
      const pagePath = options.Page(resolve(root, page));
      pageMap.set(page, pagePath);
      if (pageSet.has(pagePath)) {
        continue;
      }
      if (!existsSync(pagePath)) {
        errors.push(`Page file not found: ${pagePath}`);
      }
      pageSet.add(pagePath);
    }
  }

  const propsSet = new Set<string>();
  const propsMap = new Map<string, string>();
  if (typeof options.props === "string") {
    const propsPath = resolve(root, options.props);
    propsMap.set(options.props, propsPath);
    if (!propsSet.has(propsPath)) {
      if (!existsSync(propsPath)) {
        errors.push(`Props file not found: ${propsPath}`);
      }
      propsSet.add(propsPath);
    }
  } else if (typeof options.props === "function" && pages) {
    for (const page of pages) {
      const propsPath = options.props(resolve(root, page));
      propsMap.set(page, propsPath);
      if (propsSet.has(propsPath)) {
        continue;
      }
      if (!existsSync(propsPath)) {
        errors.push(`Props file not found: ${propsPath}`);
      }
      propsSet.add(propsPath);
    }
  }

  if (errors.length) {
    throw new Error("React Stream Plugin Validation:\n" + errors.join("\n"));
  }

  return { pageMap, pageSet, propsMap, propsSet };
}
