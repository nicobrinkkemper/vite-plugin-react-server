import { describe, test, expect } from "vitest";
import { createTransformer } from "vite-plugin-react-server/loader";
import { DEFAULT_LOADER_CONFIG } from "vite-plugin-react-server/config";
import type { LoaderConfig } from "react-server-loader/directives";
import { parse } from "react-server-loader/directives";

// Helper function to create complete LoaderConfig objects
const createLoaderConfig = (
  overrides: Partial<LoaderConfig> = {}
): LoaderConfig => ({
  ...DEFAULT_LOADER_CONFIG,
  ...overrides,
  mode: overrides.mode || "test",
  parse: overrides.parse || parse,
});

describe("Custom Loader Configuration", () => {
  describe("Custom Import Paths", () => {
    test("should use custom server import path", async () => {
      const customLoaderConfig = createLoaderConfig({
        importServerPath: "react-server-dom-webpack/server",
        importClientPath: "react-server-dom-webpack/client",
      });

      const transformer = createTransformer({
        options: {
          loader: customLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
        ssr: true,
      });
      const code = `"use server";\nexport async function add(a, b) { return a + b; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain(
        'import { registerServerReference } from "react-server-dom-webpack/server"'
      );
      expect(result.code).toContain(
        'registerServerReference(add, "test.ts", "add")'
      );
    });

    test("should use custom client import path", async () => {
      const customLoaderConfig = createLoaderConfig({
        importServerPath: "react-server-dom-webpack/server",
        importClientPath: "react-server-dom-webpack/client",
      });

      const transformer = createTransformer({
        options: {
          loader: customLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
        ssr: false,
      });
      const code = `"use client";\nexport function Button() { return "button"; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain(
        'import { registerClientReference } from "react-server-dom-webpack/client"'
      );
      expect(result.code).toContain("registerClientReference");
    });
  });

  describe("Custom Registration Function Names", () => {
    test("should use custom server registration function name", async () => {
      const customLoaderConfig = createLoaderConfig({
        registerServerReferenceName: "customRegisterServerReference",
      });

      const transformer = createTransformer({
        options: {
          loader: customLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use server";\nexport async function add(a, b) { return a + b; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain(
        "import { customRegisterServerReference } from"
      );
      expect(result.code).toContain(
        'customRegisterServerReference(add, "test.ts", "add")'
      );
    });

    test("should use custom client registration function name", async () => {
      const customLoaderConfig = createLoaderConfig({
        registerClientReferenceName: "customRegisterClientReference",
      });

      const transformer = createTransformer({
        options: {
          loader: customLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use client";\nexport function Button() { return "button"; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain(
        "import { customRegisterClientReference } from"
      );
      expect(result.code).toContain("customRegisterClientReference");
    });
  });

  describe("Environment-Specific Configuration", () => {
    test("should handle development mode configuration", async () => {
      const developmentLoaderConfig = createLoaderConfig({
        mode: "development",
        importServerPath: "react-server-dom-esm/server.node",
      });

      const transformer = createTransformer({
        options: {
          loader: developmentLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use server";\nexport async function add(a, b) { return a + b; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain('.node"');
    });

    test("should handle production mode configuration", async () => {
      const productionLoaderConfig = createLoaderConfig({
        mode: "production",
        importServerPath: "react-server-dom-esm/server",
      });

      const transformer = createTransformer({
        options: {
          loader: productionLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use server";\nexport async function add(a, b) { return a + b; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).not.toContain('.node"');
      expect(result.code).toContain('"react-server-dom-esm/server"');
    });
  });

  describe("Directive Pattern Configuration", () => {
    test("should only recognize standard server directives", async () => {
      const customLoaderConfig = createLoaderConfig({
        serverDirective: /^"use backend"/,
      });

      const transformer = createTransformer({
        options: {
          loader: customLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use backend";\nexport async function add(a, b) { return a + b; }`;

      const result = await transformer(code, "test.ts");

      // Custom directives are not supported - should not transform
      expect(result.code).not.toContain("registerServerReference");
      expect(result.code).toContain('"use backend"');
    });

    test("should only recognize standard client directives", async () => {
      const customLoaderConfig = createLoaderConfig({
        clientDirective: /^"use frontend"/,
      });

      const transformer = createTransformer({
        options: {
          loader: customLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use frontend";\nexport function Button() { return "button"; }`;

      const result = await transformer(code, "test.ts");

      // Custom directives are not supported - should not transform
      expect(result.code).not.toContain("registerClientReference");
      expect(result.code).toContain('"use frontend"');
    });
  });

  describe("React Compiler Directive Support", () => {
    test("should not recognize 'use no memo' directive", async () => {
      const loaderConfig = createLoaderConfig({
        allowedDirectives: {
          "use client": {
            functionLevel: false,
            target: "client",
          },
          "use server": {
            functionLevel: true,
            target: "server",
          },
          "use no memo": {
            functionLevel: false,
            target: "client",
          },
        },
      });

      const transformer = createTransformer({
        options: {
          loader: loaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use no memo";\nexport function OptimizedComponent() { return "no memoization"; }`;

      const result = await transformer(code, "test.ts");

      // React Compiler directives are not supported by this loader
      expect(result.code).not.toContain("registerClientReference");
      expect(result.code).toContain('"use no memo"');
    });
  });

  describe("Webpack Integration", () => {
    test("should support webpack-based RSC configuration", async () => {
      const webpackLoaderConfig = createLoaderConfig({
        importServerPath: "react-server-dom-webpack/server",
        importClientPath: "react-server-dom-webpack/client",
        registerServerReferenceName: "registerServerReference",
        registerClientReferenceName: "registerClientReference",
      });

      const transformer = createTransformer({
        options: {
          loader: webpackLoaderConfig,
          verbose: false,
          panicThreshold: "none",
        },
      });
      const serverCode = `"use server";\nexport async function serverAction() { return "server"; }`;
      const clientCode = `"use client";\nexport function ClientComponent() { return "Client"; }`;

      const serverResult = await transformer(serverCode, "server.ts");
      const clientResult = await transformer(clientCode, "client.ts");

      expect(serverResult.code).toContain("react-server-dom-webpack/server");
      expect(clientResult.code).toContain("react-server-dom-webpack/client");
    });
  });

  describe("Basic Directive Transformation", () => {
    test("should transform use server directive", async () => {
      const transformer = createTransformer({
        options: {
          loader: createLoaderConfig(),
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use server";\nexport async function add(a, b) { return a + b; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain(
        'registerServerReference(add, "test.ts", "add")'
      );
      expect(result.code).not.toContain('"use server"');
    });

    test("should transform use client directive", async () => {
      const transformer = createTransformer({
        options: {
          loader: createLoaderConfig(),
          verbose: false,
          panicThreshold: "none",
        },
      });
      const code = `"use client";\nexport function Button() { return "button"; }`;

      const result = await transformer(code, "test.ts");

      expect(result.code).toContain("registerClientReference");
      expect(result.code).not.toContain('"use client"');
    });
  });
});
