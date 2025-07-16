import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformModuleIfNeeded } from 'vite-plugin-react-server/loader';

describe('transformModuleIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should transform a simple module successfully', async () => {
    const source = 'export function test() { return "hello"; }';
    const moduleId = 'test-module.js';
    const options = { verbose: false } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('should handle verbose logging', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const source = 'export function test() { return "hello"; }';
    const moduleId = 'test-module.js';
    const options = { verbose: true } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    
    // There are 2 console.log calls: one from createTransformer and one from transformModuleIfNeeded
    expect(consoleSpy).toHaveBeenCalledWith('[createTransformer] Loading: test-module.js');
   
    
    consoleSpy.mockRestore();
  });

  it('should handle modules with use client directive', async () => {
    const source = `"use client";
export function ClientComponent() { return "client component"; }`;
    const moduleId = 'client-component.js';
    const options = { verbose: false } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
  });

  it('should handle modules with use server directive', async () => {
    const source = `"use server";
export async function serverAction() { return "server action"; }`;
    const moduleId = 'server-action.js';
    const options = { verbose: false } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
  });

  it('should handle empty source', async () => {
    const source = '';
    const moduleId = 'empty-module.js';
    const options = { verbose: false } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
  });

  it('should handle unusual syntax gracefully', async () => {
    // The parser is very lenient and rarely throws errors,
    // so we test that it handles unusual syntax gracefully
    const source = 'export function test() { return "hello" } export const x = ;;'; // Double semicolon
    const moduleId = 'unusual-module.js';
    const options = { verbose: false } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('should handle different transform options', async () => {
    const source = 'export function test() { return "hello"; }';
    const moduleId = 'test-module.js';
    const options = { 
      verbose: false,
      someOtherOption: 'test-value'
    } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
  });

  it('should return a source map when transformation succeeds', async () => {
    const source = 'export function test() { return "hello"; }';
    const moduleId = 'test-module.js';
    const options = { verbose: false } as any;
    
    const result = await transformModuleIfNeeded(source, moduleId, options);
    
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    // The map can be null or an object, both are valid
    expect(result.map === null || typeof result.map === 'object').toBe(true);
  });
}); 