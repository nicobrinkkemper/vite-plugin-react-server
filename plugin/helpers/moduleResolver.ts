let stashedResolve: any = null;

export function setStashedResolve(resolve: any) {
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
      },
      stashedResolve
    );

    if (!result) {
      console.warn(`Failed to resolve import: ${specifier}`);
      return null;
    }

    return result;
  } catch (error) {
    console.error(`Error resolving import ${specifier}:`, error);
    return null;
  }
} 