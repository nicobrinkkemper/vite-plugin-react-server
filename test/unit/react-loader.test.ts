// test/unit/loader/loader.test.ts
import { describe, test, expect } from "vitest";
import { createTransformer } from "react-server-loader/directives";

const loadReact = async (source: string, url = "test.js") => {
  const transformer = createTransformer({
    options: {
      verbose: false, // Enable verbose logging
    },
    isServerEnvironment: true, // Test in server environment
  });
  
  const result = await transformer(source, url);
  return { source: result.code };
};

describe("Load React code with registrations and directive stripping", () => {
  test("should handle source maps with multiple lines", async () => {
    const result = await loadReact(
      `"use server";
export async function test() {
  return 42;
}`,
      "test.server.js"
    );
    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use server");
    expect(result.source).toContain("registerServerReference(test");
  });

  test("should handle source maps for client components", async () => {
    const result = await loadReact(
      `"use client";
export function test(arg1) {
  return 42;
}`,
      "test.client.js"
    );

    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use client");
    expect(result.source).toContain("registerClientReference(function() { throw new Error(\"Attempted to call test(");
  });
});

describe("Should register server functions", () => {
  test("should register server function with 'test as testLocal' export", async () => {
    const result = await loadReact(
      `"use server";
async function test() {
  return 42;
}
  
export { test as testLocal };`,
      "test.server.js"
    );

    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use server");
    expect(result.source).toContain("registerServerReference(test, \"test.server.js\", \"testLocal\");");
  });

  test("should register client components", async () => {
    const result = await loadReact(
      `"use client";
export async function test() {
  return 42;
}`,
      "test.client.js"
    );

    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use client");
    expect(result.source).toContain("registerClientReference(function() { throw new Error(\"Attempted to call test()");
  });

  test("should register server functions with multiple functions", async () => {
    const result = await loadReact(
      `"use server";
export async function getTodos() {
  return [];
}

export async function addTodo(title) {
  return { id: 1, title };
}`,
      "test.server.js"
    );

    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use server");
    expect(result.source).toContain("registerServerReference(getTodos");
    expect(result.source).toContain("registerServerReference(addTodo");
  });

  test("should register client components with multiple exports", async () => {
    const result = await loadReact(
      `"use client";
import React from "react";
export function Button() {
  return React.createElement("button", null, "Click me");
}

export function Input() {
  return React.createElement("input", null);
}`,
      "test.client.js"
    );
    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use client");
    expect(result.source).toContain("export const Button = registerClientReference(function() { throw new Error(\"Attempted to call Button(");
    expect(result.source).toContain("export const Input = registerClientReference(function() { throw new Error(\"Attempted to call Input(");
  });

  test("should register server functions with function level directives", async () => {
    const result = await loadReact(
      `
export async function test() {
  "use server";
  return 42;
}

export async function test2() {
  return 42;
}`,
      "test.server.js"
    );
    expect(result.source).toBeDefined();
    expect(result.source).not.toContain("use server");
    // In a .server.js file, ALL exported functions are registered as server references
    // (the function-level "use server" directive is redundant in server modules)
    expect(result.source).toContain("registerServerReference(test");
    expect(result.source).toContain("registerServerReference(test2");
  });
});
