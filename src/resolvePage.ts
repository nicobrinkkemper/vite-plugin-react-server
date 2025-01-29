type ResolvePageOptions = {
  pageModule: Record<string, any>;
  path: string;
  url: string;
  exportName: string;
};

type ResolvePageResult =
  | { type: "success"; key: string; Page: any }
  | { type: "error"; error: Error }
  | { type: "skip" };

export async function resolvePage({
  pageModule,
  path,
  url,
  exportName,
}: ResolvePageOptions): Promise<ResolvePageResult> {
  if (!pageModule) {
    return {
      type: "error",
      error: new Error(`pageModule is ${typeof pageModule}`),
    };
  }
  const keys =
    typeof pageModule === "object" && pageModule != null
      ? Object.keys(pageModule)
      : [];
  const found = keys.find((v) => v === exportName || v === url || v === path);
  if (found) {
    if (typeof pageModule[found] === "function") {
      return {
        type: "success",
        key: found,
        Page: pageModule[found],
      };
    } else {
      if (
        typeof pageModule === "object" &&
        pageModule != null &&
        Object.keys(pageModule).includes("type")
      )
        return pageModule as ResolvePageResult;
      return {
        type: "error",
        [exportName]: () => found,
        error: pageModule[found]["error"],
      };
    }
  }
  if (keys.includes("type")) return pageModule as ResolvePageResult;
  return {
    type: "error",
    error: new Error(
      `Could not find Page export "${exportName}" in "${path}". ${
        typeof pageModule === "object" && pageModule != null
          ? keys.length
            ? "Available exports: " + keys.join(", ")
            : "The object was defined but has no properties."
          : "typeof pageModule =" + typeof pageModule
      }`,
      { cause: pageModule }
    ),
  };
}
