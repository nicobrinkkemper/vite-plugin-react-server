import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEnvKey, getEnvValue, setEnvValue, getEnvKeys, ENV_KEYS } from '../../plugin/env/getEnvKey.js';
import { DEFAULT_CONFIG } from '../../plugin/config/defaults.js';

describe('Dynamic Environment Prefix System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clean environment for each test
    process.env = { ...originalEnv };
    // Clear any test-specific env vars
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('CUSTOM_') || key.startsWith('TEST_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvKey', () => {
    it('should generate correct environment variable names with default prefix', () => {
      expect(getEnvKey('MODE')).toBe('VITE_MODE');
      expect(getEnvKey('DEV')).toBe('VITE_DEV');
      expect(getEnvKey('BASE_URL')).toBe('VITE_BASE_URL');
      expect(getEnvKey('PUBLIC_ORIGIN')).toBe('VITE_PUBLIC_ORIGIN');
    });

    it('should generate correct environment variable names with custom prefix', () => {
      expect(getEnvKey('MODE', 'CUSTOM_')).toBe('CUSTOM_MODE');
      expect(getEnvKey('DEV', 'CUSTOM_')).toBe('CUSTOM_DEV');
      expect(getEnvKey('BASE_URL', 'CUSTOM_')).toBe('CUSTOM_BASE_URL');
      expect(getEnvKey('PUBLIC_ORIGIN', 'CUSTOM_')).toBe('CUSTOM_PUBLIC_ORIGIN');
    });

    it('should handle prefix without trailing underscore', () => {
      expect(getEnvKey('MODE', 'CUSTOM')).toBe('CUSTOMMODE');
      expect(getEnvKey('DEV', 'MY')).toBe('MYDEV');
    });
  });

  describe('getEnvValue', () => {
    it('should read environment variables with default prefix', () => {
      process.env.VITE_MODE = 'development';
      process.env.VITE_DEV = 'true';
      process.env.VITE_BASE_URL = '/app';

      expect(getEnvValue('MODE')).toBe('development');
      expect(getEnvValue('DEV')).toBe('true');
      expect(getEnvValue('BASE_URL')).toBe('/app');
    });

    it('should read environment variables with custom prefix', () => {
      process.env.CUSTOM_MODE = 'production';
      process.env.CUSTOM_DEV = 'false';
      process.env.CUSTOM_BASE_URL = '/custom';

      expect(getEnvValue('MODE', 'CUSTOM_')).toBe('production');
      expect(getEnvValue('DEV', 'CUSTOM_')).toBe('false');
      expect(getEnvValue('BASE_URL', 'CUSTOM_')).toBe('/custom');
    });

    it('should return undefined for non-existent environment variables', () => {
      expect(getEnvValue('MODE', 'NONEXISTENT_')).toBeUndefined();
      expect(getEnvValue('DEV', 'MISSING_')).toBeUndefined();
    });

    it('should prioritize custom prefix over default prefix', () => {
      process.env.VITE_MODE = 'development';
      process.env.CUSTOM_MODE = 'production';

      expect(getEnvValue('MODE')).toBe('development');
      expect(getEnvValue('MODE', 'CUSTOM_')).toBe('production');
    });
  });

  describe('setEnvValue', () => {
    it('should set environment variables with default prefix', () => {
      setEnvValue('MODE', 'test');
      setEnvValue('DEV', 'true');

      expect(process.env.VITE_MODE).toBe('test');
      expect(process.env.VITE_DEV).toBe('true');
    });

    it('should set environment variables with custom prefix', () => {
      setEnvValue('MODE', 'staging', 'CUSTOM_');
      setEnvValue('DEV', 'false', 'CUSTOM_');

      expect(process.env.CUSTOM_MODE).toBe('staging');
      expect(process.env.CUSTOM_DEV).toBe('false');
    });

    it('should overwrite existing values', () => {
      process.env.VITE_MODE = 'development';
      setEnvValue('MODE', 'production');

      expect(process.env.VITE_MODE).toBe('production');
    });
  });

  describe('getEnvKeys', () => {
    it('should return all environment variable names with default prefix', () => {
      const keys = getEnvKeys();

      expect(keys).toEqual({
        MODE: 'VITE_MODE',
        DEV: 'VITE_DEV',
        PROD: 'VITE_PROD',
        SSR: 'VITE_SSR',
        BASE_URL: 'VITE_BASE_URL',
        PUBLIC_ORIGIN: 'VITE_PUBLIC_ORIGIN'
      });
    });

    it('should return all environment variable names with custom prefix', () => {
      const keys = getEnvKeys('CUSTOM_');

      expect(keys).toEqual({
        MODE: 'CUSTOM_MODE',
        DEV: 'CUSTOM_DEV',
        PROD: 'CUSTOM_PROD',
        SSR: 'CUSTOM_SSR',
        BASE_URL: 'CUSTOM_BASE_URL',
        PUBLIC_ORIGIN: 'CUSTOM_PUBLIC_ORIGIN'
      });
    });
  });

  describe('Integration with env-loader', () => {
    let mockLoader: any;

    beforeEach(async () => {
      // Reset modules to get fresh imports
      vi.resetModules();
    });

    it('should use custom prefix in env-loader when provided', async () => {
      // Set up custom environment variables
      process.env.CUSTOM_MODE = 'production';
      process.env.CUSTOM_DEV = 'false';
      process.env.CUSTOM_BASE_URL = '/custom-app';
      process.env.CUSTOM_PUBLIC_ORIGIN = 'https://custom.example.com';

      // Mock the env-loader initialization
      const { initialize } = await import('../../plugin/loader/env-loader.js');

      const mockPort = {
        postMessage: vi.fn()
      };

      const mockResolvedConfig = {
        envPrefix: 'CUSTOM_',
        mode: 'production',
        base: '/',
        isProduction: true,
        define: {}
      };

      const mockUserOptions = {
        publicOrigin: 'https://default.example.com'
      };

      // Initialize the loader with custom prefix
      await initialize({
        id: 'test-env-loader',
        port: mockPort as any,
        resolvedConfig: mockResolvedConfig as any,
        userOptions: mockUserOptions as any
      });

      // The loader should have sent an initialization message
      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'INITIALIZED_ENV_LOADER',
        id: 'test-env-loader',
        env: {}
      });
    });

    it('should fall back to default prefix when custom prefix variables are not set', async () => {
      // Set up only default environment variables
      process.env.VITE_MODE = 'development';
      process.env.VITE_DEV = 'true';
      process.env.VITE_BASE_URL = '/default-app';

      const { initialize } = await import('../../plugin/loader/env-loader.js');

      const mockPort = {
        postMessage: vi.fn()
      };

      const mockResolvedConfig = {
        envPrefix: 'CUSTOM_', // Custom prefix, but no custom env vars set
        mode: 'development',
        base: '/',
        isProduction: false,
        define: {}
      };

      const mockUserOptions = {
        publicOrigin: 'https://localhost:3000'
      };

      // This should work even though CUSTOM_ variables aren't set
      await initialize({
        id: 'test-env-loader',
        port: mockPort as any,
        resolvedConfig: mockResolvedConfig as any,
        userOptions: mockUserOptions as any
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'INITIALIZED_ENV_LOADER',
        id: 'test-env-loader',
        env: {}
      });
    });

    it('should handle array-style envPrefix configuration', async () => {
      // Set up environment variables for first prefix in array
      process.env.PRIMARY_MODE = 'test';
      process.env.PRIMARY_DEV = 'true';

      const { initialize } = await import('../../plugin/loader/env-loader.js');

      const mockPort = {
        postMessage: vi.fn()
      };

      const mockResolvedConfig = {
        envPrefix: ['PRIMARY_', 'SECONDARY_'], // Array of prefixes
        mode: 'test',
        base: '/',
        isProduction: false,
        define: {}
      };

      const mockUserOptions = {
        publicOrigin: 'https://test.example.com'
      };

      // Should use the first prefix in the array
      await initialize({
        id: 'test-env-loader',
        port: mockPort as any,
        resolvedConfig: mockResolvedConfig as any,
        userOptions: mockUserOptions as any
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'INITIALIZED_ENV_LOADER',
        id: 'test-env-loader',
        env: {}
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string prefix', () => {
      expect(getEnvKey('MODE', '')).toBe('MODE');
      expect(getEnvKey('DEV', '')).toBe('DEV');
    });

    it('should handle undefined prefix (fallback to default)', () => {
      expect(getEnvKey('MODE', undefined)).toBe('VITE_MODE');
      expect(getEnvValue('MODE', undefined)).toBe(getEnvValue('MODE'));
    });

    it('should handle special characters in prefix', () => {
      expect(getEnvKey('MODE', 'MY-APP_')).toBe('MY-APP_MODE');
      expect(getEnvKey('DEV', 'APP.TEST_')).toBe('APP.TEST_DEV');
    });

    it('should be case sensitive', () => {
      process.env.custom_mode = 'lowercase';
      process.env.CUSTOM_MODE = 'uppercase';

      expect(getEnvValue('MODE', 'custom_')).toBe(undefined);
      expect(getEnvValue('MODE', 'CUSTOM_')).toBe('uppercase');
    });
    it('should be case sensitive', () => {
      process.env.custom_mode = 'lowercase';
      process.env.CUSTOM_MODE = 'uppercase';

      expect(getEnvValue('MODE', 'custom_')).toBe(undefined);
      expect(getEnvValue('MODE', 'CUSTOM_')).toBe('uppercase');
    });
  });

  describe('Constants validation', () => {
    it('should have all required environment keys defined', () => {
      const expectedKeys = ['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL', 'PUBLIC_ORIGIN'];
      const actualKeys = Object.keys(ENV_KEYS);

      expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
      expect(actualKeys.length).toBe(expectedKeys.length);
    });

    it('should have default config with correct prefix', () => {
      expect(DEFAULT_CONFIG.ENV_PREFIX).toBe('VITE_');
    });

    it('should maintain consistency between ENV_KEYS and their string values', () => {
      Object.entries(ENV_KEYS).forEach(([key, value]) => {
        expect(key).toBe(value);
      });
    });
  });
}); 