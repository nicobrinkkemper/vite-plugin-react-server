import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stashReturnValue, clearStashedReturnValues } from 'vite-plugin-react-server/helpers';

describe('stashReturnValue', () => {
  beforeEach(() => {
    // Clear the global cache before each test
    clearStashedReturnValues();
  });

  it('should cache function results based on arguments', () => {
    const mockFn = vi.fn((arg1: string, arg2: number) => {
      return `${arg1}_${arg2}`;
    }) as any;
    
    const stashedFn = stashReturnValue(mockFn);
    
    // First call should execute the function
    const result1 = stashedFn('test', 123);
    expect(result1).toBe('test_123');
    expect(mockFn).toHaveBeenCalledTimes(1);
    
    // Second call with same args should return cached result
    const result2 = stashedFn('test', 123);
    expect(result2).toBe('test_123');
    expect(mockFn).toHaveBeenCalledTimes(1); // Still only called once
  });

  it('should cache different argument combinations separately', () => {
    const mockFn = vi.fn((arg1: string, arg2: number) => {
      return `${arg1}_${arg2}`;
    }) as any;
    
    const stashedFn = stashReturnValue(mockFn);
    
    const result1 = stashedFn('test', 123);
    const result2 = stashedFn('test', 456);
    const result3 = stashedFn('hello', 123);
    
    expect(result1).toBe('test_123');
    expect(result2).toBe('test_456');
    expect(result3).toBe('hello_123');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should handle null and undefined arguments', () => {
    const mockFn = vi.fn((arg1: any, arg2: any) => {
      return `${arg1}_${arg2}`;
    }) as any;
    
    const stashedFn = stashReturnValue(mockFn);
    
    const result1 = stashedFn(null, undefined);
    const result2 = stashedFn(null, undefined);
    
    expect(result1).toBe('null_undefined');
    expect(result2).toBe('null_undefined');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should handle boolean arguments', () => {
    const mockFn = vi.fn((arg1: boolean, arg2: boolean) => {
      return `${arg1}_${arg2}`;
    }) as any;
    
    const stashedFn = stashReturnValue(mockFn);
    
    const result1 = stashedFn(true, false);
    const result2 = stashedFn(true, false);
    
    expect(result1).toBe('true_false');
    expect(result2).toBe('true_false');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should handle objects with id property', () => {
    const mockFn = vi.fn((arg1: any) => {
      return `result_${arg1.id}`;
    }) as any;
    
    const stashedFn = stashReturnValue(mockFn);
    
    const obj = { id: 'test123', name: 'Test' };
    const result1 = stashedFn(obj);
    const result2 = stashedFn(obj);
    
    expect(result1).toBe('result_test123');
    expect(result2).toBe('result_test123');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should clear cache when clearStashedReturnValues is called', () => {
    const mockFn = vi.fn((arg: string) => {
      return `result_${arg}`;
    }) as any;
    
    const stashedFn = stashReturnValue(mockFn);
    
    // First call
    const result1 = stashedFn('test');
    expect(result1).toBe('result_test');
    expect(mockFn).toHaveBeenCalledTimes(1);
    
    // Clear cache
    clearStashedReturnValues();
    
    // Call again with same args - should execute function again
    const result2 = stashedFn('test');
    expect(result2).toBe('result_test');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
}); 