import type { ResolvedUserOptions } from "../types.js";

type ResolvePageAndPropsOptionsSuccess<T extends "Page" | "props"> = {
  [optionName in T]: string;
} & { type: "success"; error?: never };

type ResolvePageAndPropsOptionsError<T extends "Page" | "props"> = {
  [optionName in T]?: never;
} & { type: "error"; error: Error };

export async function resolveUrlOption<T extends "Page" | "props">(
  options: Pick<ResolvedUserOptions, T>,
  optionName: T,
  url: string
): Promise<
  ResolvePageAndPropsOptionsSuccess<T> | ResolvePageAndPropsOptionsError<T>
> {
  try {
    switch (typeof options[optionName]) {
      case "function": {
        const result = options[optionName](
          url
        );
        if (typeof result === "string") {
          return { type: "success", [optionName]: result };
        }
        if (result instanceof Promise) {
          try {
            const promiseResult = await result;
            if (typeof promiseResult === "string") {
              return { type: "success", [optionName]: promiseResult };
            }
          } catch (error) {
            return { type: "error", error: error as Error };
          }
        }
        break;
      }
      case "string":
        return { type: "success", [optionName]: options[optionName] };
      default:
        break;
    }
    return { type: "error", error: new Error("Page must return a string") };
  } catch (error) {
    return { type: "error", error: error as Error };
  }
}
