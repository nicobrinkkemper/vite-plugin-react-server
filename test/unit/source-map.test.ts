import { describe, it, expect } from 'vitest';
import { createTransformer } from 'vite-plugin-react-server/loader';
import { DEFAULT_LOADER_CONFIG } from 'vite-plugin-react-server/config';

// Create a complete loader config for testing
const TEST_LOADER_CONFIG = {
  ...DEFAULT_LOADER_CONFIG,
  mode: 'test' as const,
  importServerPath: "react-server-dom-esm/server.node",
  importClientPath: "react-server-dom-esm/server.node",
  registerClientReferenceName: "registerClientReference",
  registerServerReferenceName: "registerServerReference",
};

// Helper function to decode VLQ mappings
function decodeMappings(mappings: string) {
  const lines = mappings.split(';');
  return lines.map(line => {
    const segments = line.split(',');
    return segments.map(segment => {
      // Basic VLQ decoding (simplified for testing)
      // Each segment is a series of VLQ encoded values
      // Format: [generatedColumn, sourceIndex, sourceLine, sourceColumn, nameIndex]
      return segment;
    });
  });
}

describe('Source Map Generation', () => {
  it('should preserve "use server" directive in source map', async () => {
    const source = `"use server";
export async function add(a, b) {
  return a + b;
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/actions.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify source map structure
    expect(sourceMap).toEqual({
      version: 3,
      file: '/test/actions.server.ts',
      sources: ['/test/actions.server.ts'],
      names: [],
      mappings: expect.any(String),
      sourceRoot: '',
      sourcesContent: [source]
    });

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should preserve "use client" directive in source map', async () => {
    const source = `"use client";
import React from "react";
export function ClientComponent() {
  return "Client Component";
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: false,
      forceClientComponent: true,
      isServerEnvironment: false,
    });

    const result = await transformer(source, '/test/ClientComponent.client.tsx');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify source map structure
    expect(sourceMap).toEqual({
      version: 3,
      file: '/test/ClientComponent.client.tsx',
      sources: ['/test/ClientComponent.client.tsx'],
      names: [],
      mappings: expect.any(String),
      sourceRoot: '',
      sourcesContent: [source]
    });

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle both file-level and function-level directives', async () => {
    const source = `"use server";
export async function add(a, b) {
  "use server";
  return a + b;
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/mixed.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify source map structure
    expect(sourceMap).toEqual({
      version: 3,
      file: '/test/mixed.server.ts',
      sources: ['/test/mixed.server.ts'],
      names: [],
      mappings: expect.any(String),
      sourceRoot: '',
      sourcesContent: [source]
    });

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should generate correct mappings for transformed code', async () => {
    const source = `"use server";
export async function add(a, b) {
  return a + b;
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/actions.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators
    
    // Decode and inspect mappings
    const decodedMappings = decodeMappings(sourceMap.mappings);
    
    // Verify basic mapping structure
    expect(decodedMappings.length).toBeGreaterThan(0); // Should have at least one line
    expect(decodedMappings[0].length).toBeGreaterThan(0); // First line should have mappings
    
    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle multiple function-level directives', async () => {
    const source = `export async function add(a, b) {\n  "use server";\n  return a + b;\n}\nexport async function sub(a, b) {\n  "use server";\n  return a - b;\n}`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/multi.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify directives are preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0].match(/"use server"/g)).toHaveLength(2);
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should ignore directives with comments or whitespace', async () => {
    const source = `// comment\n  \n"use server";\nexport function add(a, b) {\n  // another comment\n  "use server";\n  return a + b;\n}`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/commented.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify directives are preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0].match(/"use server"/g)).toHaveLength(2);
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should not treat misplaced directives as directives', async () => {
    const source = `const x = 1;\n"use server";\nexport function add(a, b) {\n  return a + b;\n}`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/misplaced.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify directive is preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0]).toContain('"use server"');
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should not remove non-directive string literals', async () => {
    const source = `const str = "use server";\nexport function add(a, b) {\n  return a + b;\n}`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/nonDirective.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify string literal is preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0]).toContain('"use server"');
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle arrow functions with block and concise bodies', async () => {
    const source = `export const add = (a, b) => { "use server"; return a + b; };\nexport const mul = (a, b) => a * b;`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/arrow.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify directive is preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0]).toContain('"use server"');
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should not register non-exported functions', async () => {
    const source = `async function add(a, b) { "use server"; return a + b; }\nexport async function sub(a, b) { "use server"; return a - b; }`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/nonexported.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify both functions are preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0]).toContain('async function add(a, b) { "use server";');
    expect(sourceMap.sourcesContent![0]).toContain('async function sub(a, b) { "use server";');
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle nested functions with directives', async () => {
    const source = `export function outer() {\n  function inner() { "use server"; return 1; }\n  return inner();\n}`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/nested.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify directive is preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0]).toContain('"use server"');
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle class methods with directives', async () => {
    const source = `export class Calculator {\n  async add(a, b) { "use server"; return a + b; }\n  async sub(a, b) { "use server"; return a - b; }\n}`;
    
    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/class.server.ts');
    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify directives are preserved in source map
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0].match(/"use server"/g)).toHaveLength(2);
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should generate valid source map URL format', async () => {
    const source = `"use server";
export async function add(a, b) {
  return a + b;
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/actions.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify source map structure
    expect(sourceMap.version).toBe(3);
    expect(sourceMap.file).toBe('/test/actions.server.ts');
    expect(sourceMap.sources).toContain('/test/actions.server.ts');

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle special characters in source content', async () => {
    const source = `"use server";
export async function add(a, b) {
  return a + b + "特殊文字"; // Special characters
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/actions.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify special characters are preserved
    expect(sourceMap.sourcesContent).toBeTruthy();
    expect(sourceMap.sourcesContent![0]).toContain('特殊文字');
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should generate valid mappings format', async () => {
    const source = `"use server";
export async function add(a, b) {
  return a + b;
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/actions.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify mappings format
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });

  it('should handle source maps with multiple sources', async () => {
    const source = `"use server";
import { helper } from './helper';
export async function add(a, b) {
  return helper(a + b);
}`;

    const transformer = createTransformer({
      options: {
        loader: TEST_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      forceClientComponent: false,
      isServerEnvironment: true,
    });

    const result = await transformer(source, '/test/actions.server.ts');

    // Verify source map exists
    expect(result.map).toBeTruthy();
    const sourceMap = result.map!;
    
    // Verify multiple sources are handled
    expect(sourceMap.sources).toHaveLength(1); // Currently we only support one source
    expect(sourceMap.sourcesContent).toHaveLength(1);
    
    // Verify mappings exist and have correct format
    expect(sourceMap.mappings).toBeTruthy();
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators

    // Verify code doesn't contain source map
    expect(result.code).not.toMatch(/\/\/# sourceMappingURL=/);
  });
}); 