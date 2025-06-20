import type { ResolveHookContext } from "node:module";

type ResolveFunction = (
  specifier: string,
  context: ResolveHookContext,
  nextResolve?: ResolveFunction
) => Promise<{ url: string; shortCircuit: boolean }>;

type GetSourceHookContext = {
  format: string;
  url: string;
};

type GetSourceFunction = (
  url: string,
  context: GetSourceHookContext,
  defaultGetSource: GetSourceFunction
) => Promise<{ source: string | ArrayBuffer | SharedArrayBuffer | Uint8Array }>;

let stashedResolve: ResolveFunction | null = null;
let stashedGetSource: GetSourceFunction | null = null;

export function setStashedResolve(resolve: ResolveFunction) {
  stashedResolve = resolve;
}

export function setStashedGetSource(getSource: GetSourceFunction) {
  stashedGetSource = getSource;
}

export async function resolve(specifier: string, context: ResolveHookContext, defaultResolve: ResolveFunction) {
  // We stash this in case we end up needing to resolve export * statements later.
  stashedResolve = defaultResolve;
  
  // Add react-server condition if not present
  if (!context.conditions.includes('react-server')) {
    context = {
      ...context,
      conditions: [...context.conditions, 'react-server']
    };
  }
  
  return await defaultResolve(specifier, context, defaultResolve);
}

export async function getSource(url: string, context: GetSourceHookContext, defaultGetSource: GetSourceFunction) {
  // We stash this in case we end up needing to resolve export * statements later.
  stashedGetSource = defaultGetSource;
  return defaultGetSource(url, context, defaultGetSource);
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

export async function loadClientSource(url: string) {
  if (stashedGetSource === null) {
    throw new Error(
      "Expected getSource to have been called before loadClientSource"
    );
  }

  try {
    const result = await stashedGetSource(
      url,
      {
        format: "module",
        url
      },
      stashedGetSource
    );

    return result.source;
  } catch (error) {
    console.error(`Error loading source for ${url}:`, error);
    return null;
  }
} 