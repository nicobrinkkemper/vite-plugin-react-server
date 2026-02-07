import { describe, it, expect, vi } from "vitest";
import { createTransformer } from "vite-plugin-react-server/loader";
import type { ResolvedUserOptions } from "vite-plugin-react-server/types";

// Mock options for testing
const createMockOptions = (overrides: Partial<Pick<ResolvedUserOptions, 'verbose' | 'loader' | 'panicThreshold'>> = {}): Pick<ResolvedUserOptions, 'verbose' | 'loader' | 'panicThreshold'> => ({
  verbose: false,
  panicThreshold: 'none',
  loader: {
    serverDirective: /^"use server"$/,
    clientDirective: /^"use client"$/,
    allowedDirectives: {
      "use server": { functionLevel: true, target: "server" },
      "use client": { functionLevel: false, target: "client" }
    },
    getDirectiveType: () => "server",
    mode: "development",
    importServerPath: "react-server-dom-esm/server",
    importClientPath: "react-server-dom-esm/client", 
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference",
    isServerFunctionCode: () => false,
    isClientComponentCode: () => false,
    parse: async (source: string) => {
      const { parse } = await import('acorn');
      return {
        ast: parse(source, { ecmaVersion: 'latest', sourceType: 'module' }),
        code: source,
        map: null
      };
    }
  },
  ...overrides
});

describe("panicThreshold functionality", () => {
  // Test source with misplaced directive (should generate warning)
  const sourceWithWarning = `// This comment comes before the directive
"use server";
export async function test() {
  return 42;
}`;

  // Test source with properly placed directive (should not generate warning)
  const sourceWithoutWarning = `"use server";
export async function test() {
  return 42;
}`;

  it("should downgrade errors to warnings when panicThreshold='none'", async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const transformer = createTransformer({
      options: createMockOptions({ panicThreshold: 'none' }),
      isServerEnvironment: true,
    });

    const result = await transformer(sourceWithWarning, 'test.js');
    
    // Should not throw and should return transformed result
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
    
    // Should have downgraded error to warning
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("File-level directives must be at the top")
    );
    
    consoleSpy.mockRestore();
  });

  it("should treat directive issues as errors when panicThreshold='all_errors'", async () => {
    const transformer = createTransformer({
      options: createMockOptions({ panicThreshold: 'all_errors' })
    });

    await expect(transformer(sourceWithWarning, 'test.js')).rejects.toThrow(
      "File-level directives must be at the top of the file, before any other code"
    );
  });

  it("should treat directive issues as errors when panicThreshold='critical_errors'", async () => {
    const transformer = createTransformer({
      options: createMockOptions({ panicThreshold: 'critical_errors' })
    });

    await expect(transformer(sourceWithWarning, 'test.js')).rejects.toThrow(
      "File-level directives must be at the top of the file, before any other code"
    );
  });

  it("should not throw when panicThreshold='all_errors' but no warnings exist", async () => {
    const transformer = createTransformer({
      options: createMockOptions({ panicThreshold: 'all_errors' }),
      isServerEnvironment: true,
    });

    const result = await transformer(sourceWithoutWarning, 'test.js');
    
    // Should not throw and should return transformed result
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
  });

  it("should always treat directive issues as errors in production", async () => {
    // Mock NODE_ENV to be production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    try {
      // Test with panicThreshold='none' - should still treat as error in production
      const transformer = createTransformer({
        options: createMockOptions({ panicThreshold: 'none' })
      });

      await expect(transformer(sourceWithWarning, 'test.js')).rejects.toThrow(
        "File-level directives must be at the top of the file, before any other code"
      );
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("should show detailed context when downgrading to warnings", async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const transformer = createTransformer({
      options: createMockOptions({ panicThreshold: 'none' }),
      isServerEnvironment: true,
    });

    await transformer(sourceWithWarning, 'test.js');
    
    // Should show detailed warning information when downgraded
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("File-level directives must be at the top")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('>   2 | "use server";')
    );
    
    consoleSpy.mockRestore();
  });
}); 