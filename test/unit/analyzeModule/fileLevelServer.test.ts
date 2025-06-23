import { analyzeModule } from "../../../dist/plugin/loader/directives/analyzeModule.js";
import { describe, test, expect } from "vitest";
import { testLoaderConfig } from "./testLoaderConfig.js";

describe("analyzeModule - file-level server directives", () => {
  test("should detect file-level use server directive", async () => {
    const result = await analyzeModule(`"use server";
export function test() {
  return 42;
}`, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
  });

  test("should detect file-level use server directive with single quotes", async () => {
    const result = await analyzeModule(`'use server';
export function test() {
  return 42;
}`, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
  });

  test("should detect file-level use server directive after comments", async () => {
    const source = `// Some comment
/* Another comment */
"use server";
export function test() {
  return 42;
}`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
  });
}); 