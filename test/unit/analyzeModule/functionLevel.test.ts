import { analyzeModule } from "vite-plugin-react-server/loader";
import { describe, test, expect } from "vitest";
import { testLoaderConfig } from "./testLoaderConfig.ts";

describe("analyzeModule - function-level directives", () => {
  test("should detect function-level use server directive", async () => {
    const result = await analyzeModule(
      `export async function test() {
  "use server";
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0]?.type).toBe("server");
  });

  test("should allow multiple function-level use server directives", async () => {
    const result = await analyzeModule(
      `export async function test1() {
  "use server";
  return 42;
}

export async function test2() {
  "use server";
  return 43;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.functionLevel).toHaveLength(2);
    expect(result.directiveInfo?.functionLevel[0]?.type).toBe("server");
    expect(result.directiveInfo?.functionLevel[1]?.type).toBe("server");
  });

  test("should allow function-level directives after file-level directive", async () => {
    const result = await analyzeModule(
      `"use client";
export async function test() {
  "use client";
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(result.directiveInfo?.functionLevel).toHaveLength(0);
    expect(result.directiveInfo?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Function-level 'use client' isn't allowed"),
          type: "client"
        })
      ])
    );
  });

  test("should detect function-level directives in arrow functions", async () => {
    const result = await analyzeModule(
      `export const test = async () => {
  "use server";
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0]?.type).toBe("server");
  });

  test("should detect function-level directives in function expressions", async () => {
    const result = await analyzeModule(
      `export const test = async function() {
  "use server";
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0]?.type).toBe("server");
  });

  test("should detect only function-level directives and ignore non-function-level ones", async () => {
    const result = await analyzeModule(
      `"use server";
export async function test() {
  "use server";
  return 42;
}

const x = "use server"; // This should be ignored`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
    expect(result.directiveInfo?.functionLevel).toHaveLength(0);
    expect(result.directiveInfo?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("already defined at the top of the file"),
          type: "server"
        })
      ])
    );
  });

  test("should detect function-level directives const function declaration", async () => {
    const result = await analyzeModule(
      `const test = async function() {
  "use server";
  return 42;
}`,
      testLoaderConfig
    );
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0]?.type).toBe("server");
  });
});
