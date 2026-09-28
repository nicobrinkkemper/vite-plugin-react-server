import { describe, it, expect } from "vitest";
import { rewriteReactRequires } from "../../plugin/environments/createReactRequireInteropPlugin.js";

describe("rewriteReactRequires", () => {
  it("leaves a chunk without a react-family runtime require alone", () => {
    expect(rewriteReactRequires(`var x = __require("lodash");`)).toBeNull();
    expect(rewriteReactRequires(`import React from "react";`)).toBeNull();
  });

  it("hoists __require('react') into a static namespace import", () => {
    const result = rewriteReactRequires(
      `var React = __require("react");\nexports.h = React.useState;`,
    );
    expect(result).not.toBeNull();
    expect(result!.specifiers).toEqual(["react"]);
    expect(result!.code).toMatch(
      /^import \* as (__vprsReact\$0) from "react";\n/,
    );
    expect(result!.code).toContain(
      `var React = (__vprsReact$0.default ?? __vprsReact$0);`,
    );
    expect(result!.code).not.toContain("__require(");
  });

  it("shares one import per specifier and covers react-dom and subpaths", () => {
    const result = rewriteReactRequires(
      `var a = __require('react');\n` +
        `var b = __require("react");\n` +
        `var c = __require("react-dom");\n` +
        `var d = __require("react/jsx-runtime");\n` +
        `var keep = __require("react-i18next");`,
    );
    expect(result!.specifiers).toEqual([
      "react",
      "react-dom",
      "react/jsx-runtime",
    ]);
    const importLines = result!.code
      .split("\n")
      .filter((l) => l.startsWith("import * as "));
    expect(importLines).toHaveLength(3);
    expect(result!.code).toContain(
      `var a = (__vprsReact$0.default ?? __vprsReact$0);`,
    );
    expect(result!.code).toContain(
      `var b = (__vprsReact$0.default ?? __vprsReact$0);`,
    );
    // Not a react-family external: left for the runtime require.
    expect(result!.code).toContain(`__require("react-i18next")`);
  });
});
