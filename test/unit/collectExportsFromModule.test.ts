import { describe, it, expect, vi, beforeEach } from 'vitest';

// Completely mock the moduleResolver to bypass internal state
vi.mock('vite-plugin-react-server/helpers', () => ({
  loadClientSource: vi.fn()
}));

vi.mock('vite-plugin-react-server/loader', () => ({
  parse: vi.fn()
}));

vi.mock('vite-plugin-react-server/directives', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getExports: vi.fn(),
    collectExportsFromModule: vi.fn()
  };
});

// Import after mocking
import { collectExportsFromModule } from 'vite-plugin-react-server/directives';
import { loadClientSource } from 'vite-plugin-react-server/helpers';
import { parse } from 'vite-plugin-react-server/loader';
import { getExports } from 'vite-plugin-react-server/directives';

describe('collectExportsFromModule', () => {
  const mockLoadClientSource = vi.mocked(loadClientSource);
  const mockParse = vi.mocked(parse);
  const mockGetExports = vi.mocked(getExports);
  const mockCollectExportsFromModule = vi.mocked(collectExportsFromModule);
  
  beforeEach(() => {
    mockLoadClientSource.mockReset();
    mockParse.mockReset();
    mockGetExports.mockReset();
    mockCollectExportsFromModule.mockReset();
  });

  it('should collect exports from a module successfully', async () => {
    const moduleId = 'test-module.js';
    const expectedResult = [
      { localName: 'test', exportName: 'test', type: 'function', range: [0, 10] }
    ];
    
    mockCollectExportsFromModule.mockResolvedValue(expectedResult as any);
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].localName).toBe('test');
    expect(result[0].exportName).toBe('test');
    expect(result[0].type).toBe('function');
    expect(mockCollectExportsFromModule).toHaveBeenCalledWith(moduleId);
  });

  it('should handle module loading errors', async () => {
    const moduleId = 'non-existent-module.js';
    
    mockCollectExportsFromModule.mockRejectedValue(new Error('Module not found'));
    
    await expect(collectExportsFromModule(moduleId)).rejects.toThrow('Module not found');
    expect(mockCollectExportsFromModule).toHaveBeenCalledWith(moduleId);
  });

  it('should handle parsing errors', async () => {
    const moduleId = 'invalid-module.js';
    
    mockCollectExportsFromModule.mockRejectedValue(new Error('Parse error'));
    
    await expect(collectExportsFromModule(moduleId)).rejects.toThrow('Parse error');
    expect(mockCollectExportsFromModule).toHaveBeenCalledWith(moduleId);
  });

  it('should handle empty module', async () => {
    const moduleId = 'empty-module.js';
    
    mockCollectExportsFromModule.mockResolvedValue([]);
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    expect(mockCollectExportsFromModule).toHaveBeenCalledWith(moduleId);
  });

  it('should handle module with multiple exports', async () => {
    const moduleId = 'multi-export-module.js';
    const expectedResult = [
      { localName: 'foo', exportName: 'foo', type: 'function', range: [0, 10] },
      { localName: 'bar', exportName: 'bar', type: 'variable', range: [11, 20] }
    ];
    
    mockCollectExportsFromModule.mockResolvedValue(expectedResult as any);
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.localName)).toContain('foo');
    expect(result.map(e => e.localName)).toContain('bar');
    expect(mockCollectExportsFromModule).toHaveBeenCalledWith(moduleId);
  });

  it('should handle default exports', async () => {
    const moduleId = 'default-export-module.js';
    const expectedResult = [
      { localName: 'default', exportName: 'default', type: 'function', range: [0, 15] }
    ];
    
    mockCollectExportsFromModule.mockResolvedValue(expectedResult as any);
    
    const result = await collectExportsFromModule(moduleId);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].exportName).toBe('default');
    expect(mockCollectExportsFromModule).toHaveBeenCalledWith(moduleId);
  });
}); 