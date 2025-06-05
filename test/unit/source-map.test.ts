import { describe, it, expect } from 'vitest';
import { transformModuleWithPreservedFunctions } from '../../plugin/loader/transformModuleWithPreservedFunctions';
import { parse } from '../../plugin/loader/parse';

describe('Source Map Generation', () => {
  it('should preserve "use server" directive in source map', async () => {
    const source = `"use server";
export function add(a, b) {
  return a + b;
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/actions.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    // Extract source map from the result
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    
    // Verify source map structure
    expect(sourceMap.version).toBe(3);
    expect(sourceMap.file).toBe('/test/actions.server.ts');
    expect(sourceMap.sources).toContain('/test/actions.server.ts');
    
    // Verify original source is preserved with directive
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
    
    // Verify mappings exist
    expect(sourceMap.mappings).toBeTruthy();
  });

  it('should preserve "use client" directive in source map', async () => {
    const source = `"use client";
import React from "react";
export function ClientComponent() {
  return <div>Client Component</div>;
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/ClientComponent.client.tsx',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      false,
      true,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    // Extract source map from the result
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    
    // Verify source map structure
    expect(sourceMap.version).toBe(3);
    expect(sourceMap.file).toBe('/test/ClientComponent.client.tsx');
    expect(sourceMap.sources).toContain('/test/ClientComponent.client.tsx');
    
    // Verify original source is preserved with directive
    expect(sourceMap.sourcesContent[0]).toContain('"use client"');
    
    // Verify mappings exist
    expect(sourceMap.mappings).toBeTruthy();

    // Verify transformed code has error-throwing function
    expect(result).toContain('function() { throw new Error("Attempted to call ClientComponent() from the server but ClientComponent is on the client');
  });

  it('should handle both file-level and function-level directives', async () => {
    const source = `"use server";
export function add(a, b) {
  "use server";
  return a + b;
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/mixed.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    // Extract source map from the result
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    
    // Verify both directives are preserved in source map
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
    expect(sourceMap.sourcesContent[0].match(/"use server"/g)).toHaveLength(2);
    
    // Verify transformed code doesn't contain directives
    expect(result).not.toContain('"use server"');
  });

  it('should generate correct mappings for transformed code', async () => {
    const source = `"use server";
export function add(a, b) {
  return a + b;
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/actions.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    // Extract source map from the result
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    
    // Verify transformed code has registerServerReference
    expect(result).toContain('registerServerReference');
    
    // Verify mappings can map back to original source
    expect(sourceMap.mappings).toMatch(/^AAAA(;AACA)*$/); // More detailed line-by-line mapping
  });

  it('should handle multiple function-level directives', async () => {
    const source = `export function add(a, b) {\n  \"use server\";\n  return a + b;\n}\nexport function sub(a, b) {\n  \"use server\";\n  return a - b;\n}`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/multi.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).not.toContain('"use server"');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0].match(/"use server"/g)).toHaveLength(2);
  });

  it('should ignore directives with comments or whitespace', async () => {
    const source = `// comment\n  \n\"use server\";\nexport function add(a, b) {\n  // another comment\n  \"use server\";\n  return a + b;\n}`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/commented.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).not.toContain('"use server"');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0].match(/"use server"/g)).toHaveLength(2);
  });

  it('should not treat misplaced directives as directives', async () => {
    const source = `const x = 1;\n\"use server\";\nexport function add(a, b) {\n  return a + b;\n}`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/misplaced.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    // The directive is not at the top, so it should remain
    expect(result).toContain('"use server"');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
  });

  it('should not remove non-directive string literals', async () => {
    const source = `const str = \"use server\";\nexport function add(a, b) {\n  return a + b;\n}`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/nonDirective.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).toContain('"use server"');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
  });

  it('should handle arrow functions with block and concise bodies', async () => {
    const source = `export const add = (a, b) => { \"use server\"; return a + b; };\nexport const mul = (a, b) => a * b;`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/arrow.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).not.toContain('"use server"');
    expect(result).toContain('a * b');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
  });

  it('should not register non-exported functions', async () => {
    const source = `function add(a, b) { \"use server\"; return a + b; }\nexport function sub(a, b) { \"use server\"; return a - b; }`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/nonexported.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).not.toContain('add(a, b) { "use server";');
    expect(result).not.toContain('"use server"');
    expect(result).toContain('sub(a, b)');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0]).toContain('function add(a, b) { "use server";');
  });

  it('should handle nested functions with directives', async () => {
    const source = `export function outer() {\n  function inner() { \"use server\"; return 1; }\n  return inner();\n}`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/nested.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).not.toContain('"use server"');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
  });

  it('should handle class methods with directives', async () => {
    const source = `export class Calculator {\n  add(a, b) { \"use server\"; return a + b; }\n  sub(a, b) { \"use server\"; return a - b; }\n}`;
    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/class.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );
    expect(result).not.toContain('"use server"');
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=(.+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMapBase64 = sourceMapMatch![1].replace('data:application/json;charset=utf-8;base64,', '');
    const sourceMap = JSON.parse(Buffer.from(sourceMapBase64, 'base64').toString());
    expect(sourceMap.sourcesContent[0]).toContain('"use server"');
  });

  it('should generate valid source map URL format', async () => {
    const source = `"use server";
export function add(a, b) {
  return a + b;
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/actions.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    // Verify source map URL format
    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    expect(sourceMapMatch![1]).toMatch(/^[A-Za-z0-9+/=]+$/); // Valid base64 characters
  });

  it('should handle special characters in source content', async () => {
    const source = `"use server";
export function add(a, b) {
  return a + b + "特殊文字"; // Special characters
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/actions.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMap = JSON.parse(Buffer.from(sourceMapMatch![1], 'base64').toString());
    
    // Verify special characters are preserved
    expect(sourceMap.sourcesContent[0]).toContain('特殊文字');
  });

  it('should generate valid mappings format', async () => {
    const source = `"use server";
export function add(a, b) {
  return a + b;
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/actions.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMap = JSON.parse(Buffer.from(sourceMapMatch![1], 'base64').toString());
    
    // Verify mappings format
    expect(sourceMap.mappings).toMatch(/^[A-Za-z0-9+/=;,]+$/); // Valid VLQ characters
    expect(sourceMap.mappings).toContain(';'); // Should have line separators
  });


  it('should handle source maps with multiple sources', async () => {
    const source = `"use server";
import { helper } from './helper';
export function add(a, b) {
  return helper(a + b);
}`;

    const parseResult = parse(source);
    const result = transformModuleWithPreservedFunctions(
      source,
      '/test/actions.server.ts',
      parseResult.program,
      parseResult.directives,
      parseResult.sourceMap,
      true,
      false,
      true,
      "react-server-dom-esm/server",
      "registerClientReference",
      "registerServerReference",
      true
    );

    const sourceMapMatch = result.match(/\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)$/m);
    expect(sourceMapMatch).toBeTruthy();
    const sourceMap = JSON.parse(Buffer.from(sourceMapMatch![1], 'base64').toString());
    
    // Verify multiple sources are handled
    expect(sourceMap.sources).toHaveLength(1); // Currently we only support one source
    expect(sourceMap.sourcesContent).toHaveLength(1);
  });
}); 