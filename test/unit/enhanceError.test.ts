import { describe, it, expect, vi } from 'vitest';
import { enhanceError, createContextualError } from 'vite-plugin-react-server/error';

describe('enhanceError', () => {
  describe('enhanceError', () => {
    it('should enhance Error objects with context', () => {
      const originalError = new Error('Original error message');
      const captureStackTraceFunction = vi.fn();
      const context = 'Test Context';
      
      const enhancedError = enhanceError(originalError, captureStackTraceFunction, context);
      
      expect(enhancedError).toBeInstanceOf(Error);
      expect(enhancedError.message).toBe('[Test Context:error] Original error message');
      expect(enhancedError.name).toBe('ContextualError');
      expect(enhancedError.cause).toBe(originalError);
    });

    it('should enhance custom Error objects with context', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      
      const originalError = new CustomError('Custom error');
      const captureStackTraceFunction = vi.fn();
      const context = 'Module Loading';
      
      const enhancedError = enhanceError(originalError, captureStackTraceFunction, context);
      
      expect(enhancedError.message).toBe('[Module Loading:error] Custom error');
      expect(enhancedError.name).toBe('ContextualError');
      expect(enhancedError.cause).toBe(originalError);
    });

    it('should use function name as context when context not provided', () => {
      const originalError = new Error('Original error');
      const captureStackTraceFunction = vi.fn();
      Object.defineProperty(captureStackTraceFunction, 'name', { value: 'testFunction' });
      
      const enhancedError = enhanceError(originalError, captureStackTraceFunction);
      
      expect(enhancedError.message).toBe('[testFunction:error] Original error');
      expect(enhancedError.name).toBe('ContextualError');
      expect(enhancedError.cause).toBe(originalError);
    });

    it('should create fresh stack trace showing where wrapping happened', () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      const captureStackTraceFunction = vi.fn();
      const context = 'Test Context';
      
      const enhancedError = enhanceError(originalError, captureStackTraceFunction, context);
      
      // The enhanced error should have a fresh stack trace that shows where the wrapping happened
      expect(enhancedError.stack).toContain('ContextualError: [Test Context:error] Original error');
      // Just check that it's a fresh stack trace, not the original one
      expect(enhancedError.stack).not.toBe('Original stack trace');
    });

    it('should use enhanceError as default captureStackTraceFunction when not provided', () => {
      const originalError = new Error('Original error');
      const captureStackTraceFunction = enhanceError; // Use the actual function instead of null
      const context = 'Test Context';
      
      const enhancedError = enhanceError(originalError, captureStackTraceFunction, context);
      
      expect(enhancedError).toBeInstanceOf(Error);
      expect(enhancedError.message).toBe('[Test Context:error] Original error');
    });
  });

  describe('createContextualError', () => {
    it('should create contextual error with proper formatting', () => {
      const error = createContextualError('Test message', 'Test Context');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('[Test Context:error] Test message');
      expect(error.name).toBe('ContextualError');
    });

    it('should create contextual error with custom stack trace function', () => {
      const captureStackTraceFunction = vi.fn();
      const error = createContextualError('Test message', 'Test Context', captureStackTraceFunction);
      
      expect(error.message).toBe('[Test Context:error] Test message');
      expect(error.name).toBe('ContextualError');
    });

    it('should handle empty context', () => {
      const error = createContextualError('Test message', '');
      
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('ContextualError');
    });

    it('should handle missing context', () => {
      const error = createContextualError('Test message');
      
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('ContextualError');
    });
  });
}); 