import { describe, it, expect, vi } from "vitest";
import { createTransformer } from "vite-plugin-react-server/loader";
import type { ResolvedUserOptions } from "vite-plugin-react-server/types";

// Mock options for testing
const createMockOptions = (overrides: Partial<Pick<ResolvedUserOptions, 'verbose' | 'loader' | 'failOnWarnings'>> = {}): Pick<ResolvedUserOptions, 'verbose' | 'loader' | 'failOnWarnings'> => ({
  verbose: false,
  failOnWarnings: false,
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

describe("failOnWarnings functionality", () => {
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

  it("should show warnings but not throw when failOnWarnings=false", async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const transformer = createTransformer({
      options: createMockOptions({ failOnWarnings: false })
    });

    const result = await transformer(sourceWithWarning, 'test.js');
    
    // Should not throw and should return transformed result
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
    
    // Should have shown warnings
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("File-level directives must be at the top")
    );
    
    consoleSpy.mockRestore();
  });

  it("should throw error when failOnWarnings=true", async () => {
    const transformer = createTransformer({
      options: createMockOptions({ failOnWarnings: true })
    });

    await expect(transformer(sourceWithWarning, 'test.js')).rejects.toThrow(
      "File-level directives must be at the top of the file, before any other code"
    );
  });

  it("should not throw when failOnWarnings=true but no warnings exist", async () => {
    const transformer = createTransformer({
      options: createMockOptions({ failOnWarnings: true })
    });

    const result = await transformer(sourceWithoutWarning, 'test.js');
    
    // Should not throw and should return transformed result
    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
  });

  it("should always throw in production mode regardless of failOnWarnings", async () => {
    // Mock NODE_ENV to be production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    try {
      // Test with failOnWarnings=false - should still throw in production
      const transformer = createTransformer({
        options: createMockOptions({ failOnWarnings: false })
      });

      await expect(transformer(sourceWithWarning, 'test.js')).rejects.toThrow(
        "File-level directives must be at the top of the file, before any other code"
      );
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("should show detailed warnings in development mode when failOnWarnings=false", async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const transformer = createTransformer({
      options: createMockOptions({ failOnWarnings: false, verbose: true })
    });

    await transformer(sourceWithWarning, 'test.js');
    
    // Should show detailed warning information
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("File-level directives must be at the top")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('at line 2: "use server"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('content before directive:')
    );
    
    consoleSpy.mockRestore();
  });
}); 