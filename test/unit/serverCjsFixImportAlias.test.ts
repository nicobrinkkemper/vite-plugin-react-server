import { describe, it, expect } from "vitest";
import { parseAst } from "vite";
import { vitePluginReactDevServer } from "../../plugin/dev-server/plugin.server.js";
import { testUserOptions } from "../test-config.js";

/**
 * The dev server rewrites `import { … } from "react"` in the server
 * environment into a default import plus destructuring. An import rename
 * (`a as b`) is not valid inside a destructuring pattern, so the rewrite has
 * to translate each specifier.
 */
describe("dev server react named-import rewrite", () => {
  const transform = (code: string): string => {
    const plugin = vitePluginReactDevServer(testUserOptions).find(
      (p) => p.name === "vite-plugin-react-server:server-cjs-fix"
    ) as any;
    return plugin.transform.handler(code, "/src/page.tsx").code;
  };

  // Evaluates the rewritten module body against a stand-in react module and
  // returns the requested bindings.
  const evaluate = (code: string, names: string[]) => {
    const out = transform(code);
    parseAst(out);
    const react = { cache: () => "cache", use: () => "use" };
    const body = out.replace(
      /import (\w+) from "react";/g,
      "const $1 = __react;"
    );
    const bindings = new Function(
      "__react",
      `${body}\nreturn { ${names.join(", ")} };`
    )(react);
    return { react, bindings };
  };

  it("keeps a plain named import working", () => {
    const { react, bindings } = evaluate(
      `import { cache, use } from "react";`,
      ["cache", "use"]
    );
    expect(bindings).toEqual({ cache: react.cache, use: react.use });
  });

  it("binds an aliased import to its local name", () => {
    const { react, bindings } = evaluate(
      `import { cache as memo, use } from "react";`,
      ["memo", "use"]
    );
    expect(bindings).toEqual({ memo: react.cache, use: react.use });
  });

  it("binds `default as X` to the module itself", () => {
    const { react, bindings } = evaluate(
      `import { default as React, cache as memo } from "react";`,
      ["React", "memo"]
    );
    expect(bindings).toEqual({ React: react, memo: react.cache });
  });

  it("rewrites every react import in a module", () => {
    const { react, bindings } = evaluate(
      `import { cache as memo } from "react";\nimport { use as read } from 'react'`,
      ["memo", "read"]
    );
    expect(bindings).toEqual({ memo: react.cache, read: react.use });
  });
});
