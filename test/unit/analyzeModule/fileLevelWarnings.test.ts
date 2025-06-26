import { analyzeModule } from "../../../dist/plugin/loader/directives/analyzeModule.js";
import { describe, test, expect } from "vitest";
import { testLoaderConfig } from "./testLoaderConfig.js";

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
      `export function test() {
  return 42;
}
"use client";`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.warnings).toHaveLength(1);
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