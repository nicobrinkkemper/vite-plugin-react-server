import { toError } from "../error/toError.js";

type ResolvePageOptions<N extends string> = {
  id: string;
  exportName: N;
  loader: (id: string) => Promise<any>;
};

type ResolvePageResult<T, N extends string> =
  | { type: "success"; Page: T; module: { [key in N]: T } }
  | { type: "error"; error: Error }
  | { type: "skip" };

/**
 * Resolves a page component from a module.
 */
export const resolvePage = async <T, N extends string>({
  id,
  exportName,
  loader,
}: ResolvePageOptions<N>): Promise<ResolvePageResult<T, N>> => {
  let module: any;
  try {
    module = await loader(id);
  } catch (error) {
    return { type: "error", error: toError(error) as Error };
  }

  if (module instanceof Error) {
    return { type: "error", error: module };
  }

  if (!(exportName in module)) {
    if ("error" in module) {
      return { type: "error", error: toError(module.error) as Error };
    }
    return {
      type: "error",
      error: new Error(`Export "${exportName}" not found in module ${id}.`),
    };
  }

  const Page = module[exportName as N];

  if (!Page) {
    return {
      type: "error",
      error: new Error(
        `Export "${exportName}" is null or undefined in module ${id}.`
      ),
    };
  }

  if (Page instanceof Error) {
    return { type: "error", error: Page };
  }

  return {
    type: "success",
    Page,
    module: module as { [key in N]: T },
  };
};
