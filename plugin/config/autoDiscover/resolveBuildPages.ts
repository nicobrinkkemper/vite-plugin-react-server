import { access } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedBuildPages, ResolvedUserOptions } from "../../types.js";
import { resolveUrlOption } from "../resolveUrlOption.js";

let stashedBuildPages: ResolvedBuildPages | null = null;
let stashedPages: string[] | null = null;

export async function resolveBuildPages({
  pages,
  userOptions,
}: {
  pages: string[];
  userOptions: Pick<ResolvedUserOptions, "Page" | "props" | "build" | "moduleBase" | "projectRoot" | "normalizer" | "moduleBasePath">;
}): Promise<ResolvedBuildPages> {
  // Check if pages array has changed
  const pagesChanged =
    !stashedPages ||
    stashedPages.length !== pages.length ||
    !stashedPages.every((page, i) => page === pages[i]);

  if (stashedBuildPages && !pagesChanged) {
    return stashedBuildPages; // Return directly without Promise.resolve
  }
  const errors: Error[] = [];
  const pageMap = new Map<string, string>();
  const propsMap = new Map<string, string>();
  const urlMap = new Map<string, { props: string | undefined; page: string }>();
  const routeMap = new Map<string, string[]>();

  for (const page of pages) {
    const pageResult = await resolveUrlOption(userOptions, "Page", page);
    if(pageResult.type === "error") {
      errors.push(pageResult.error);
      continue;
    }
    const [pageKey, pageValue] = userOptions.normalizer(pageResult.Page);
    if(!userOptions.props) {
      urlMap.set(page, { props: undefined, page: pageValue });
      pageMap.set(pageKey, pageValue);
      // Add to routeMap
      const routes = routeMap.get(pageValue) || [];
      routes.push(page);
      routeMap.set(pageValue, routes);
      continue;
    }
    try {
      await access(join(userOptions.projectRoot, pageValue));
    } catch {
      errors.push(new Error(`Page file not found: ${pageValue}`));
    }
    const propsResult = await resolveUrlOption(userOptions, "props", page);
    if(propsResult.type === "error") {
      errors.push(propsResult.error);
      continue;
    }

    // If propsPath is defined, check if it exists
    if (propsResult.props) {
      const [propsKey, propsValue] = userOptions.normalizer(propsResult.props);
      if (propsValue !== pageValue) {
        try {
          await access(join(userOptions.projectRoot, propsValue));
        } catch {
          errors.push(
            new Error(`Props file not found: ${propsValue}`)
          );
        }
      }
      urlMap.set(page, { props: propsValue, page: pageValue });
      propsMap.set(propsKey, propsValue);
      
      // Add to routeMap for both page and props files
      const pageRoutes = routeMap.get(pageValue) || [];
      pageRoutes.push(page);
      routeMap.set(pageValue, pageRoutes);
      
      const propsRoutes = routeMap.get(propsValue) || [];
      propsRoutes.push(page);
      routeMap.set(propsValue, propsRoutes);
    } else {
      // If no props path, use the page path for both
      urlMap.set(page, { props: undefined, page: pageValue });
      
      // Add to routeMap for page file only
      const routes = routeMap.get(pageValue) || [];
      routes.push(page);
      routeMap.set(pageValue, routes);
    }

    pageMap.set(pageKey, pageValue);
  }

  stashedBuildPages = { pageMap, propsMap, urlMap, routeMap, errors };
  stashedPages = [...pages];
  return stashedBuildPages;
}
