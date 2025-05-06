import { access } from "node:fs/promises";
import { join } from "node:path";
import type { CheckFilesExistReturn, ResolvedUserOptions } from "./types.js";
import { resolveUrlOption } from "./config/resolveUrlOption.js";

let stashedFiles: CheckFilesExistReturn | null = null;
let stashedPages: string[] | null = null;

export async function checkFilesExist({
  pages,
  options,
}: {
  pages: string[];
  options: Pick<ResolvedUserOptions, "Page" | "props" | "build" | "moduleBase" | "projectRoot" | "normalizer">;
}): Promise<CheckFilesExistReturn> {
  // Check if pages array has changed
  const pagesChanged =
    !stashedPages ||
    stashedPages.length !== pages.length ||
    !stashedPages.every((page, i) => page === pages[i]);

  if (stashedFiles && !pagesChanged) {
    return stashedFiles; // Return directly without Promise.resolve
  }
  const errors: Error[] = [];
  const pageSet = new Set<string>();
  const propsSet = new Set<string>();
  const pageMap = new Map<string, string>();
  const propsMap = new Map<string, string>();
  const urlMap = new Map<string, { props: string | undefined; page: string }>();


  for (const page of pages) {
    const pageResult = await resolveUrlOption(options, "Page", page);
    if(pageResult.type === "error") {
      errors.push(pageResult.error);
      continue;
    }
    if(!options.props) {
      urlMap.set(page, { props: undefined, page: pageResult.Page });
      pageSet.add(pageResult.Page);
      pageMap.set(page, pageResult.Page);
      continue;
    }
    const propsResult = await resolveUrlOption(options, "props", page);
    if(propsResult.type === "error") {
      errors.push(propsResult.error);
      continue;
    }
    const [pageKey, pageValue] = options.normalizer(pageResult.Page);

    try {
      await access(join(options.projectRoot, pageValue));
    } catch {
      errors.push(new Error(`Page file not found: ${pageValue}`));
    }

    // If propsPath is defined, check if it exists
    if (propsResult.props) {
      const [propsKey, propsValue] = options.normalizer(propsResult.props);
      if (propsValue !== pageValue) {
        try {
          await access(join(options.projectRoot, propsValue));
        } catch {
          errors.push(
            new Error(`Props file not found: ${propsValue}`)
          );
        }
      }
      urlMap.set(page, { props: propsValue, page: pageValue });
      propsSet.add(propsValue);
      propsMap.set(propsKey, propsValue);
    } else {
      // If no props path, use the page path for both
      urlMap.set(page, { props: undefined, page: pageValue });
    }

    pageSet.add(pageValue);
    pageMap.set(pageKey, pageValue);
  }

  stashedFiles = { pageMap, pageSet, propsMap, propsSet, urlMap, errors };
  stashedPages = [...pages];
  return stashedFiles;
}
