import type { ResolveHookContext } from "node:module";

type ResolveFunction = (
  specifier: string,
  context: ResolveHookContext,
  nextResolve?: ResolveFunction
) => Promise<{ url: string; shortCircuit: boolean }>;

let stashedResolve: ResolveFunction | null = null;

export function setStashedResolve(resolve: ResolveFunction) {
  stashedResolve = resolve;
}

export async function resolveClientImport(specifier: string, parentURL: string) {
  const conditions = ["node", "import"];

  if (stashedResolve === null) {
    throw new Error(
      "Expected resolve to have been called before transformSource"
    );
  }

  try {
    const result = await stashedResolve(
      specifier,
      {
        conditions,
        parentURL,
        importAttributes: {}
      },
      stashedResolve
    );

    return result.url;
  } catch (error) {
    console.error(`Error resolving import ${specifier}:`, error);
    return null;
  }
} 