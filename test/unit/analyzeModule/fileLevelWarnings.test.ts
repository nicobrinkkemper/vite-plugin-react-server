import { analyzeModule } from "vite-plugin-react-server/loader";
import { describe, test, expect } from "vitest";
import { testLoaderConfig } from "./testLoaderConfig.ts";

describe("analyzeModule - file-level directive warnings", () => {
  test("should warn about multiple file-level directives", async () => {
    const result = await analyzeModule(
      `"use client";
"use server";
export function test() {
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.warnings).toHaveLength(1);
  });

  test("should warn about mixed server/client file-level directives", async () => {
    const result = await analyzeModule(
      `"use client";
"use server";
export function test() {
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.warnings).toHaveLength(1);
  });

  test("should warn about file-level directive after code", async () => {
    const result = await analyzeModule(
      `const x = 1;\n"use server";\nexport function test() { return x; }`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
    expect(result.directiveInfo?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("must be at the top of the file"),
          type: "server"
        })
      ])
    );
  });

  // Comments are trivia, not code: a line or block comment (or a banner /
  // JSDoc, common in compiled library output) above a file-level directive
  // does NOT push it out of position, so no placement warning fires and the
  // directive is still recognised. Matches react-server-loader's directive
  // engine (≥ 19.2.9) and the documented "use client" contract.
  test("should not warn about a file-level directive after comments", async () => {
    const result = await analyzeModule(
      `// Some comment
/* Another comment */
"use client";
export function test() {
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.warnings).toHaveLength(0);
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
  });

  // Real-world libraries (e.g. compiled output of @chakra-ui/react,
  // @ark-ui/react) ship files that begin with `"use strict"; "use client";`
  // simultaneously. The analyzer must accept this without warnings: the JS
  // prologue directive ("use strict") and the React directive ("use client")
  // are orthogonal and frequently coexist.
  test("should accept 'use strict' followed by 'use client' without warnings", async () => {
    const result = await analyzeModule(
      `"use strict";
"use client";
export function test() {
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(result.directiveInfo?.warnings).toEqual([]);
  });

  test("should accept 'use strict' followed by 'use server' without warnings", async () => {
    const result = await analyzeModule(
      `"use strict";
"use server";
export async function action() {
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
    expect(result.directiveInfo?.warnings).toEqual([]);
  });

  test("should still warn when both 'use client' and 'use server' coexist after 'use strict'", async () => {
    const result = await analyzeModule(
      `"use strict";
"use client";
"use server";
export function test() {
  return 42;
}`,
      testLoaderConfig
    );
    // 'use strict' is benign; the conflict is between 'use client' (file-level)
    // and the trailing 'use server'.
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(
      result.directiveInfo?.warnings.some((w) =>
        w.message.includes("Cannot have both")
      )
    ).toBe(true);
  });
}); 