import { analyzeModule } from "../../../plugin/loader/directives/analyzeModule.js";
import { describe, test, expect } from "vitest";
import { testLoaderConfig } from "./testLoaderConfig.js";

describe("analyzeModule - file-level client directives", () => {
  test("should detect file-level use client directive", async () => {
    const result = await analyzeModule(
      `"use client";
export function test() {
  return 42;
}`,
      "test.js",
     testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
  });

  test("should detect file-level use client directive with single quotes", async () => {
    const result = await analyzeModule(
      `'use client';
export function test() {
  return 42;
}`,
      "test.js",
     testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
  });

  test("should detect file-level use client directive after comments", async () => {
    const source = `// Some comment
/* Another comment */
"use client";
export function test() {
  return 42;
}`;
    const result = await analyzeModule(source, "test.js",testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
  });

  test("Should detect class component exports", async () => {
    const source = `
    "use client";
    export class ErrorBoundary {
      render() {
        return 1;
      }
    }`;
    const result = await analyzeModule(source, "test.js",testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(result.directiveInfo?.fileLevel?.name).toBe(undefined);
    expect(result.directiveInfo?.functionLevel).toHaveLength(0);
    expect(result.directiveInfo?.warnings).toHaveLength(0);
    expect(result.exports).toBeTypeOf("object");
    if(!result.exports) {
      throw new Error("Exports is undefined");
    }
    expect(result.exports.exportNames).toHaveLength(1);
    expect(result.exports.exports.size).toBe(1);
    expect(result.exports.exports.get("ErrorBoundary")?.type).toBe("class");
  })

  test("Should detect arrow function component exports", async () => {
    const source = `
    "use client";
    export const Link = () => {
      return "a";
    }`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(result.directiveInfo?.fileLevel?.name).toBe(undefined);
    expect(result.directiveInfo?.functionLevel).toHaveLength(0);
    expect(result.directiveInfo?.warnings).toHaveLength(0);
    expect(result.exports).toBeTypeOf("object");
    if(!result.exports) {
      throw new Error("Exports is undefined");
    }
    expect(result.exports.exportNames).toHaveLength(1);
    expect(result.exports.exports.size).toBe(1);
    expect(result.exports.exports.get("Link")?.type).toBe("function");
  });
}); 