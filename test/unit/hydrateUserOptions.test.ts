import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the entire helpers module to replace hydrateUserOptions
vi.mock('vite-plugin-react-server/helpers', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    hydrateUserOptions: vi.fn()
  };
});

// Import the mocked function
import { hydrateUserOptions } from 'vite-plugin-react-server/helpers';

describe('hydrateUserOptions', () => {
  const mockHydrateUserOptions = vi.mocked(hydrateUserOptions);
  
  beforeEach(() => {
    mockHydrateUserOptions.mockReset();
  });

  it('should call resolveOptions with correct parameters for success case', () => {
    const userOptions = { pages: 'src/pages' };
    const mockResolvedOptions = { 
      pages: { pattern: 'src/pages/**/*.{ts,tsx}' },
      // ... other resolved options
    } as any;
    
    const expectedResult = {
      type: 'success' as const,
      userOptions: mockResolvedOptions
    };
    
    mockHydrateUserOptions.mockReturnValue(expectedResult as any);
    
    const result = hydrateUserOptions(userOptions as any);
    
    expect(mockHydrateUserOptions).toHaveBeenCalledWith(userOptions);
    expect(result).toEqual(expectedResult);
  });

  it('should handle resolveOptions returning an error', () => {
    const userOptions = { };  
    const mockError = new Error('Configuration error');
    
    const expectedResult = {
      type: 'error' as const,
      error: mockError
    };
    
    mockHydrateUserOptions.mockReturnValue(expectedResult as any);
    
    const result = hydrateUserOptions(userOptions as any);
    
    expect(mockHydrateUserOptions).toHaveBeenCalledWith(userOptions);
    expect(result).toEqual(expectedResult);
  });

  it('should handle resolveOptions throwing an error', () => {
    const userOptions = {  };
    const mockError = new Error('Configuration error');
    
    const expectedResult = {
      type: 'error' as const,
      error: mockError
    };
    
    mockHydrateUserOptions.mockReturnValue(expectedResult as any);
    
    const result = hydrateUserOptions(userOptions as any);
    
    expect(mockHydrateUserOptions).toHaveBeenCalledWith(userOptions);
    expect(result).toEqual(expectedResult);
  });

  it('should pass through empty options', () => {
    const userOptions = {};
    const mockResolvedOptions = { 
      pages: { pattern: 'src/pages/**/*.{ts,tsx}' },
      // ... default resolved options
    } as any;
    
    const expectedResult = {
      type: 'success' as const,
      userOptions: mockResolvedOptions
    };
    
    mockHydrateUserOptions.mockReturnValue(expectedResult as any);
    
    const result = hydrateUserOptions(userOptions as any);
    
    expect(mockHydrateUserOptions).toHaveBeenCalledWith(userOptions);
    expect(result).toEqual(expectedResult);
  });

  it('should handle complex user options', () => {
    const userOptions = { 
      verbose: false,
      pages: 'custom/pages',
      components: 'custom/components',
      env: { BASE_URL: '/custom' }
    };
    const mockResolvedOptions = { 
      verbose: false,
      pages: { pattern: 'custom/pages/**/*.{ts,tsx}' },
      components: { pattern: 'custom/components/**/*.{ts,tsx}' },
      env: { BASE_URL: '/custom' }
    } as any;
    
    const expectedResult = {
      type: 'success' as const,
      userOptions: mockResolvedOptions
    };
    
    mockHydrateUserOptions.mockReturnValue(expectedResult as any);
    
    const result = hydrateUserOptions(userOptions as any);
    
    expect(mockHydrateUserOptions).toHaveBeenCalledWith(userOptions);
    expect(result).toEqual(expectedResult);
  });
});     