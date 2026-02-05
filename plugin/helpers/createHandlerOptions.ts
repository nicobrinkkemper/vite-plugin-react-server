import type { ViteDevServer } from "vite";
import type { InlineCssOpt, PagePropOpt, ResolvedUserOptions } from "../types.js";

export function createHandlerOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  userOptions: ResolvedUserOptions<T, InlineCSS>,
  server: ViteDevServer,
  overrides: Partial<ResolvedUserOptions<T, InlineCSS>> = {}
): ResolvedUserOptions<T, InlineCSS> {
  const {
    projectRoot: _projectRoot,
    moduleBaseURL: _moduleBaseURL,
    moduleBasePath: _moduleBasePath,
    ...rest
  } = userOptions;

  return {
    ...rest,
    ...overrides,
    moduleBaseURL: server.config.base,
    moduleBasePath: server.config.base,
    projectRoot: server.config.root,
  } as ResolvedUserOptions<T, InlineCSS>;
}
