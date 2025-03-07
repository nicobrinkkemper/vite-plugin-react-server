import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckFilesExistReturn, ResolvedUserOptions } from "./types.js";
import { createInputNormalizer } from "./helpers/inputNormalizer.js";

let stashedFiles: CheckFilesExistReturn | null = null;

const resolveFileOption = (pageOrProps: string | ((url: string) => string)) => {
  if (typeof pageOrProps === "string") {
    return () => pageOrProps;
  }
  return pageOrProps;
};

export async function checkFilesExist(
  pages: string[],
  options: ResolvedUserOptions,
  root: string
): Promise<CheckFilesExistReturn> {
  if(stashedFiles){
    return stashedFiles;
  }
  if (!root || root === "") {
    throw new Error("Root not found");
  }
  const errors: string[] = [];
  const pageSet = new Set<string>();
  const propsSet = new Set<string>();
  const pageMap = new Map<string, string>();
  const propsMap = new Map<string, string>();
  const urlMap = new Map<string, { props: string; page: string }>();
  const normalizer = createInputNormalizer({
    root,
    preserveModulesRoot: options.build.preserveModulesRoot === true ? options.moduleBase : undefined,
    removeExtension: true,
  });
  const pageFn = resolveFileOption(options.Page);
  const propsFn = resolveFileOption(options.props);
  for (const page of pages) {
    const pagePath = pageFn(page);
    const propsPath = propsFn(page);
    const [pageKey, pageValue] = normalizer(pagePath);
    const [propsKey, propsValue] = normalizer(propsPath);
    try {
      if (!existsSync(join(root, pageValue))) {
        errors.push(
          `Page file not found: ${pagePath}, ${join(root, pagePath)}`
        );
      }
      if (!existsSync(join(root, propsValue))) {
        errors.push(
          `Props file not found: ${propsPath}, ${join(root, propsPath)}`
        );
      }
    } catch (error) {
      errors.push(`Error checking files: ${error}`);
    }
    urlMap.set(page, { props: propsPath, page: pagePath });
    pageSet.add(pagePath);
    propsSet.add(propsPath);
    pageMap.set(pageKey, pageValue);
    propsMap.set(propsKey, propsValue);
  }
  stashedFiles = { pageMap, pageSet, propsMap, propsSet, urlMap, errors };
  return stashedFiles;
}
