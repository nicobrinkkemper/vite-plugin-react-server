type ResolvePropsOptions = {
  propsModule: Record<string, any>;
  path: string;
  exportName: string;
  url: string;
};

type ResolvePropsResult =
  | { type: "success"; key: string; props: any }
  | { type: "error"; error: Error }
  | { type: "skip" };

function isFunction(value: any) {
  return typeof value === "function";
}

export async function resolveProps({
  propsModule,
  path,
  exportName,
  url,
}: ResolvePropsOptions): Promise<ResolvePropsResult> {
  if (!propsModule) {
    return {
      type: "error",
      error: new Error(`propsModule is ${typeof propsModule}`),
    };
  }

  if (typeof propsModule !== "object") {
    return {
      type: "error",
      error: new Error(
        `propsModule must be an object, got ${typeof propsModule}`
      ),
    };
  }

  const keys = Object.keys(propsModule);
  const found = keys.find((v) => v === exportName || v === url || v === path);
  if (found) {
    const value = propsModule[found];

    try {
      // If it's a function, call it with the URL
      if (isFunction(value)) {
        const props = await value(url);
        return {
          type: "success",
          key: found,
          props,
        };
      }

      // If it's a promise, await it
      if (value && typeof value.then === "function") {
        const props = await value;
        return {
          type: "success",
          key: found,
          props,
        };
      }

      // If it's a plain object, use it directly
      if (typeof value === "object" && value !== null) {
        return {
          type: "success",
          key: found,
          props: value,
        };
      }

      console.warn(found, "error in resolveProps", propsModule, url, path);
      return {
        type: "error",
        error: new Error(
          `Expected props export "${exportName}" in "${path}" to be a function, promise, or object that resolves to props, instead got typeof ${typeof value}.`
        ),
      };
    } catch (error) {
      console.warn(found, "error in resolveProps", propsModule, url, path);
      return {
        type: "error",
        error: error as Error,
      };
    }
  }
  const commonjs = keys.find((v) => v === "exports");

  if (!!commonjs) {
    const exportKeys = (commonjs as unknown as { exports: any })["exports"]
      ? Object.keys((commonjs as unknown as { exports: any })["exports"])
      : [];
    const foundCommonJS = exportKeys.find(
      (v) => v === exportName || v === url || v === path
    );
    return {
      type: "error",
      error: new Error(
        `Expected props export "${exportName}" in "${path}", but instead got "exports" with ${
          !!foundCommonJS
            ? foundCommonJS.toString()
            : exportKeys.length
            ? exportKeys.join(", ")
            : "no keys"
        }, this will not work. Make sure to set esModule: true in rollupOptions.output`
      ),
    };
  }

  return {
    type: "error",
    error: new Error(
      `Could not find props export "${exportName}" in "${path}". ${
        keys.length
          ? "Available exports: " + keys.join(", ")
          : "The object was defined but has no properties."
      }`
    ),
  };
}
