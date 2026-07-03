import { describe, it, expect } from "vitest";
import { createTransformer, isViteInjectedCode } from "vite-plugin-react-server/loader";

// Regression: Vite injects preamble (e.g. a __vitePreload import for files with
// dynamic import()) ABOVE a module's own source, landing above the "use client"
// directive. The directive engine must not flag that injected code as
// "real code before the directive" and throw the build. vprs supplies this via
// the tolerateLeadingCode predicate (isViteInjectedCode). See bd: smm2-sim build
// regressed on vprs 2.0 because the predicate wasn't wired into the transformer.

const loader = {
  serverDirective: /^"use server"$/,
  clientDirective: /^"use client"$/,
  allowedDirectives: {
    "use server": { functionLevel: true, target: "server" },
    "use client": { functionLevel: false, target: "client" },
  },
  getDirectiveType: (d: string) =>
    d.includes("server") ? "server" : d.includes("client") ? "client" : undefined,
  isServerFunctionCode: (c: string) => c.includes("use server"),
  isClientComponentCode: (c: string) => c.includes("use client"),
} as any;

const makeTransformer = () =>
  createTransformer({
    options: {
      loader,
      verbose: false,
      panicThreshold: "error", // throw on a genuine misplacement
      tolerateLeadingCode: isViteInjectedCode,
    },
    isServerEnvironment: true,
  } as any);

describe("isViteInjectedCode", () => {
  it("detects Vite-injected preamble markers", () => {
    expect(isViteInjectedCode(`import "__vitePreload";`)).toBe(true);
    expect(isViteInjectedCode(`if (import.meta.hot) {}`)).toBe(true);
    expect(isViteInjectedCode(`const e = import.meta.env.MODE;`)).toBe(true);
    expect(isViteInjectedCode(`import "/@vite/client";`)).toBe(true);
    expect(isViteInjectedCode(`import x from "\0vite/preload-helper";`)).toBe(true);
    // Vite's CJS named-binding preamble for an optimized dep (e.g. a "use client"
    // component doing `import { useState } from "react"`), which lands above the
    // directive in dev.
    expect(
      isViteInjectedCode(
        `const useState = __vite__cjsImport0_react["useState"];"use client";`
      )
    ).toBe(true);
  });

  it("does not flag ordinary author code", () => {
    expect(isViteInjectedCode(`"use client";\nexport const x = 1;`)).toBe(false);
    expect(isViteInjectedCode(`import { useState } from "react";`)).toBe(false);
  });
});

describe("transformer tolerates Vite-injected preamble above a directive", () => {
  // A dynamic-import client file after Vite's build injection: the preload
  // import sits above the directive.
  const injected = `import { _ as _vitePreload } from "\0vite/preload-helper.js";
"use client";
import { useState } from "react";
export function Counter() { const [n] = useState(0); return n; }`;

  it("does not throw when the leading code is Vite-injected", async () => {
    const transform = makeTransformer();
    const result = await transform(injected, "/Counter.client.js");
    expect(result).toBeDefined();
    expect(typeof result.code).toBe("string");
  });

  it("still throws on a genuine misplaced directive (no Vite markers)", async () => {
    const transform = makeTransformer();
    const realMisplacement = `const setupBeforeDirective = 1;
"use client";
export function Counter() { return null; }`;
    await expect(
      transform(realMisplacement, "/Counter.client.js")
    ).rejects.toThrow(/must be at the top/);
  });
});
