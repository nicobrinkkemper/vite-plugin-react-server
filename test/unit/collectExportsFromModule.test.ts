import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the moduleResolver functions to set up state
import { setStashedGetSource } from 'vite-plugin-react-server/helpers';

// Import the function we're testing
import { collectExportsFromModule } from 'vite-plugin-react-server/directives';

describe('collectExportsFromModule', () => {
  // Create a mock getSource function for the internal state
  const mockGetSourceFunction = vi.fn();
  
  beforeEach(() => {
    mockGetSourceFunction.mockReset();
    
    // Set up the internal state that loadClientSource needs
    setStashedGetSource(mockGetSourceFunction);
  });

  it('should collect exports from a module successfully', async () => {
    const moduleId = 'test-module.js';
    const source = 'export function test() {}';
    
    // Mock the internal getSource function to return our test source
    mockGetSourceFunction.mockResolvedValue({ source });
    
    const result = await collectExportsFromModule(moduleId);
    
    // Verify it called the dependencies correctly
    expect(mockGetSourceFunction).toHaveBeenCalledWith(
      moduleId,
      { format: 'module', url: moduleId },
      mockGetSourceFunction
    );
    
    // Verify the result
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].localName).toBe('test');
    expect(result[0].exportName).toBe('test');
    expect(result[0].type).toBe('function');
  });

  it('should handle module loading errors', async () => {
    const moduleId = 'non-existent-module.js';
    
    // Mock returns undefined source instead of rejecting
    mockGetSourceFunction.mockResolvedValue({ source: undefined });
    
    await expect(collectExportsFromModule(moduleId)).rejects.toThrow('Expected source to be a string');
  });

  it('should handle parsing errors', async () => {
    const moduleId = 'invalid-module.js';
    const source = 'invalid syntax {';
    
    mockGetSourceFunction.mockResolvedValue({ source });
    
    await expect(collectExportsFromModule(moduleId)).rejects.toThrow();
  });

  it('should handle empty module', async () => {
    const moduleId = 'empty-module.js';
    const source = '';
    
    mockGetSourceFunction.mockResolvedValue({ source });
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('should handle module with multiple exports', async () => {
    const moduleId = 'multi-export-module.js';
    const source = 'export function foo() {} export const bar = 1;';
    
    mockGetSourceFunction.mockResolvedValue({ source });
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(e => e.localName === 'foo')).toBe(true);
    expect(result.some(e => e.localName === 'bar')).toBe(true);
  });

  it('should handle default exports', async () => {
    const moduleId = 'default-export-module.js';
    const source = 'export default function() {}';
    
    mockGetSourceFunction.mockResolvedValue({ source });
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].exportName).toBe('default');
  });

  it('should throw error if source is not a string', async () => {
    const moduleId = 'bad-module.js';
    
    mockGetSourceFunction.mockResolvedValue({ source: null });
    
    await expect(collectExportsFromModule(moduleId)).rejects.toThrow('Expected source to be a string');
  });
}); 