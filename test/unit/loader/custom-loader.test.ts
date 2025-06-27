import { describe, test, expect } from "vitest";
import { createTransformer } from "vite-plugin-react-server/loader";
import { DEFAULT_LOADER_CONFIG } from "vite-plugin-react-server/config";
import type { LoaderConfig } from "vite-plugin-react-server/types";

const testOptions = (options: Partial<LoaderConfig> = {}) => ({
  options: {
    loader: createLoaderConfig(options),
    verbose: false,
    panicThreshold: "none" as const,
  },
});

// Helper function to create complete LoaderConfig objects
const createLoaderConfig = (overrides: Partial<LoaderConfig> = {}): LoaderConfig => ({
  ...DEFAULT_LOADER_CONFIG,
  mode: "test",
  importServerPath: "react-server-dom-esm/server.node",
  importClientPath: "react-server-dom-esm/server.node",
  registerServerReferenceName: "registerServerReference",
  registerClientReferenceName: "registerClientReference",
  ...overrides,
});

describe("Custom Loader Behavior", () => {
  describe("Custom Import Paths", () => {
    test("should use custom server import path", async () => {
      const customLoaderConfig = testOptions({
        importServerPath: "custom-rsc-dom/server",
      });

      const transform = createTransformer(customLoaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() { return "test"; }',
        "test.server.js"
      );

      expect(result.code).toContain('from "custom-rsc-dom/server"');
      expect(result.code).toContain("registerServerReference(action");
    });

    test("should use custom client import path", async () => {
      const customLoaderConfig = testOptions({
        importClientPath: "custom-rsc-dom/client",
      });

      const transform = createTransformer(customLoaderConfig);
      
      const result = await transform(
        '"use client";\nexport function Component() { return null; }',
        "test.client.js"
      );

      expect(result.code).toContain('from "custom-rsc-dom/client"');
      expect(result.code).toContain("registerClientReference(function() { throw new Error");
    });
  });

  describe("Custom Registration Function Names", () => {
    test("should use custom server registration function name", async () => {
      const customLoaderConfig = testOptions({
        registerServerReferenceName: "customRegisterServerReference",
      });

      const transform = createTransformer(customLoaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() { return "test"; }',
        "test.server.js"
      );

      expect(result.code).toContain("customRegisterServerReference(action");
      expect(result.code).not.toContain("registerServerReference(action");
    });

    test("should use custom client registration function name", async () => {
      const customLoaderConfig = testOptions({
        registerClientReferenceName: "customRegisterClientReference",
      });

      const transform = createTransformer(customLoaderConfig);
      
      const result = await transform(
        '"use client";\nexport function Component() { return null; }',
        "test.client.js"
      );

      expect(result.code).toContain("customRegisterClientReference(function() { throw new Error");
      expect(result.code).not.toContain("registerClientReference(function() { throw new Error");
    });
  });

  describe("Environment-Specific Configuration", () => {
    test("should use development configuration in development mode", async () => {
      const developmentLoaderConfig = testOptions({
        mode: "development",
        importServerPath: "react-server-dom-esm/server.node",
        importClientPath: "react-server-dom-esm/server.node",
      });

      const transform = createTransformer(developmentLoaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() { return "test"; }',
        "test.server.js"
      );

      expect(result.code).toContain('from "react-server-dom-esm/server.node"');
    });

    test("should use production configuration in production mode", async () => {
      const productionLoaderConfig = testOptions({
        mode: "production",
        importServerPath: "react-server-dom-esm/server",
        importClientPath: "react-server-dom-esm/server",
      });

      const transform = createTransformer(productionLoaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() { return "test"; }',
        "test.server.js"
      );

      expect(result.code).toContain('from "react-server-dom-esm/server"');
    });
  });

  describe("Directive-Based Transformation", () => {
    test("should transform server functions with use server directive", async () => {
      const loaderConfig = testOptions();

      const transform = createTransformer({
        ...loaderConfig,
        forceServerFunction: true,
      });
      
      const result = await transform(
        '"use server";\nexport async function apiHandler() {\n  return { data: "api response" };\n}',
        "test.js"
      );

      // With forceServerFunction and use server directive, this should be transformed
      expect(result.code).toContain("registerServerReference(apiHandler");
    });

    test("should transform client components with use client directive", async () => {
      const loaderConfig = testOptions();

      const transform = createTransformer({
        ...loaderConfig,
        forceClientComponent: true,
      });
      
      const result = await transform(
        '"use client";\nexport function UIComponent() {\n  return null;\n}',
        "test.js"
      );

      // With forceClientComponent and use client directive, this should be transformed
      expect(result.code).toContain("registerClientReference(function() { throw new Error");
    });
  });

  describe("Webpack Compatibility", () => {
    test("should generate webpack-compatible code", async () => {
      const webpackLoaderConfig = testOptions({
        importServerPath: "react-server-dom-webpack/server",
        importClientPath: "react-server-dom-webpack/client",
        registerServerReferenceName: "registerServerReference",
        registerClientReferenceName: "registerClientReference",
      });

      const transform = createTransformer(webpackLoaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() { return "webpack"; }',
        "test.server.js"
      );

      expect(result.code).toContain('from "react-server-dom-webpack/server"');
      expect(result.code).toContain("registerServerReference(action");
    });
  });

  describe("Error Handling", () => {
    test("should handle missing registration functions gracefully", async () => {
      const incompleteLoaderConfig = testOptions({
        registerServerReferenceName: "nonExistentFunction",
      });

      const transform = createTransformer(incompleteLoaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() { return "test"; }',
        "test.server.js"
      );

      // Should still generate code, even if registration function doesn't exist
      expect(result.code).toContain("nonExistentFunction(action");
    });
  });

  describe("Multiple Export Patterns", () => {
    test("should handle export * from client modules", async () => {
      const loaderConfig = testOptions();
      const transform = createTransformer(loaderConfig);
      
      const result = await transform(
        'export * from "./utils.js";\nexport function localFunction() { return "local"; }',
        "test.js"
      );

      expect(result.code).toContain("export");
      expect(result.code).toContain("localFunction");
    });

    test("should handle mixed export patterns", async () => {
      const loaderConfig = testOptions();
      const transform = createTransformer(loaderConfig);
      
      const result = await transform(
        '"use server";\nexport { default as Component } from "./Component.js";\nexport async function action() { return "action"; }',
        "test.server.js"
      );

      expect(result.code).toContain("registerServerReference(action");
      expect(result.code).toContain("export");
    });
  });

  describe("Source Map Preservation", () => {
    test("should preserve source maps with custom loader", async () => {
      const loaderConfig = testOptions();
      const transform = createTransformer(loaderConfig);
      
      const result = await transform(
        '"use server";\nexport async function action() {\n  return "test";\n}',
        "test.server.js"
      );

      expect(result.map).toBeDefined();
      expect(result.map?.sources).toContain("test.server.js");
      expect(result.map?.sourcesContent).toBeDefined();
    });
  });
});