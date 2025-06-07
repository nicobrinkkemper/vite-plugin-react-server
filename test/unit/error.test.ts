import { describe, it, expect, vi } from 'vitest';
import { toError, logError } from 'vite-plugin-react-server/error';
import type { Logger } from 'vite';

describe('Error Handling', () => {
  describe('toError', () => {
    it('should handle string errors', () => {
      const error = 'Test error message';
      const result = toError(error);
      expect(result).toEqual({
        name: 'Error',
        message: 'Test error message',
        stack: undefined,
        cause: undefined,
      });
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      const result = toError(error);
      expect(result).toBe(error); // Should return the original error object
    });

    it('should handle objects with error properties', () => {
      const error = {
        name: 'CustomError',
        message: 'Test message',
        stack: 'Error stack',
        cause: new Error('Cause error'),
      };
      const result = toError(error);
      expect(result).toEqual({
        name: 'CustomError',
        message: 'Test message',
        stack: 'Error stack',
        cause: expect.any(Error),
      });
    });

    it('should handle objects with non-string message', () => {
      const error = {
        name: 'CustomError',
        message: { detail: 'Test message' },
      };
      const result = toError(error);
      expect(result).toEqual({
        name: 'CustomError',
        message: '{"detail":"Test message"}',
        stack: undefined,
        cause: error,
      });
    });

    it('should handle null', () => {
      const result = toError(null);
      expect(result).toEqual({
        name: 'Unknown Error',
        message: 'Unknown Error',
        stack: undefined,
        cause: null,
      });
    });

    it('should handle undefined', () => {
      const result = toError(undefined);
      expect(result).toEqual({
        name: 'Unknown Error',
        message: 'Unknown Error',
        stack: undefined,
        cause: undefined,
      });
    });

    it('should handle objects with cause', () => {
      const error = {
        name: 'CustomError',
        message: 'Test message',
        cause: 'Cause error',
      };
      const result = toError(error);
      expect(result).toEqual({
        name: 'CustomError',
        message: 'Test message',
        stack: undefined,
        cause: {
          name: 'Error',
          message: 'Cause error',
          stack: undefined,
          cause: undefined,
        },
      });
    });
  });

  describe('logError', () => {
    const createMockLogger = (): Logger => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      warnOnce: vi.fn(),
      clearScreen: vi.fn(),
      hasWarned: false,
      hasErrorLogged: () => false,
    });

    it('should log error with stack in development when stack includes message', () => {
      const mockLogger = createMockLogger();
      const error = new Error('Test error');
      error.stack = 'Test error\nError stack';
      
      logError(error, mockLogger);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Test error\nError stack');
    });

    it('should log error with message and stack in development when stack does not include message', () => {
      const mockLogger = createMockLogger();
      const error = new Error('Test error');
      error.stack = 'Different stack';
      
      logError(error, mockLogger);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Test error\nDifferent stack', {
        error: expect.any(Error),
      });
    });

    it('should log error with message and error object in development when no stack', () => {
      const mockLogger = createMockLogger();
      const error = { message: 'Test error' };
      
      logError(error, mockLogger);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Test error', {
        error: expect.any(Object),
      });
    });

    it('should log only message in production', () => {
      const mockLogger = createMockLogger();
      const error = new Error('Test error');
      error.stack = 'Error stack';
      
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        logError(error, mockLogger);
        expect(mockLogger.error).toHaveBeenCalledWith('Test error');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should use console by default', () => {
      const originalConsole = console.error;
      console.error = vi.fn();
      
      const error = new Error('Test error');
      logError(error);
      
      expect(console.error).toHaveBeenCalled();
      console.error = originalConsole;
    });
  });
}); 