const NAMED_REACT_IMPORT =
  /import\s*\{([^}]+)\}\s*from\s*["']react["']\s*;?/g;

/** Matches code that holds at least one `import { … } from "react"`. */
export const NAMED_REACT_IMPORT_FILTER = new RegExp(NAMED_REACT_IMPORT.source);

/**
 * Rewrites `import { a, b as c } from "react"` into a default import plus
 * destructuring, for an environment where react resolves to a CJS-only build.
 *
 * Import specifiers and destructuring patterns spell a rename differently
 * (`a as b` against `a: b`), and `default as X` names the module itself, so
 * each specifier is translated instead of copied.
 */
export const rewriteReactNamedImports = (code: string): string => {
  let counter = 0;
  return code.replace(NAMED_REACT_IMPORT, (_match, specifiers: string) => {
    const reactModule = `__react_cjs_${counter++}`;
    const properties: string[] = [];
    const defaults: string[] = [];
    for (const specifier of specifiers.split(",")) {
      const [imported, local = imported] = specifier.trim().split(/\s+as\s+/);
      if (!imported) continue;
      if (imported === "default") defaults.push(local);
      else properties.push(imported === local ? local : `${imported}: ${local}`);
    }
    return [
      `import ${reactModule} from "react";`,
      ...(properties.length
        ? [`const { ${properties.join(", ")} } = ${reactModule};`]
        : []),
      ...defaults.map((local) => `const ${local} = ${reactModule};`),
    ].join(" ");
  });
};
