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

  test("should warn about file-level directive after comments", async () => {
    const result = await analyzeModule(
      `// Some comment
/* Another comment */
"use client";
export function test() {
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.warnings).toHaveLength(1);
  });
}); 