import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('server.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export plugin when NODE_OPTIONS contains react-server condition', async () => {
    process.env.NODE_OPTIONS = '--conditions react-server';
    
    const serverModule = await import('../../server.js');
    
    expect(serverModule.vitePluginReactServer).toBeDefined();
    expect(typeof serverModule.vitePluginReactServer).toBe('function');
  });

  it('should export plugin when NODE_OPTIONS contains react-server with equals', async () => {
    process.env.NODE_OPTIONS = '--conditions=react-server';
    
    const serverModule = await import('../../server.js');
    
    expect(serverModule.vitePluginReactServer).toBeDefined();
    expect(typeof serverModule.vitePluginReactServer).toBe('function');
  });

  it('should throw error when NODE_OPTIONS does not contain react-server', async () => {
    process.env.NODE_OPTIONS = '--conditions client';
    
    await expect(async () => {
      await import('../../server.js');
    }).rejects.toThrow('Condition mismatch, should be react-server but got client');
  });

  it('should throw error when NODE_OPTIONS is undefined', async () => {
    delete process.env.NODE_OPTIONS;
    
    await expect(async () => {
      await import('../../server.js');
    }).rejects.toThrow('Condition mismatch, should be react-server but got client');
  });

  it('should throw error when NODE_OPTIONS is empty', async () => {
    process.env.NODE_OPTIONS = '';
    
    await expect(async () => {
      await import('../../server.js');
    }).rejects.toThrow('Condition mismatch, should be react-server but got client');
  });

  it('should handle complex NODE_OPTIONS with react-server', async () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --conditions react-server --experimental-modules';
    
    const serverModule = await import('../../server.js');
    
    expect(serverModule.vitePluginReactServer).toBeDefined();
    expect(typeof serverModule.vitePluginReactServer).toBe('function');
  });

  it('should handle NODE_OPTIONS with other conditions but not react-server', async () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --conditions development --experimental-modules';
    
    await expect(async () => {
      await import('../../server.js');
    }).rejects.toThrow('Condition mismatch, should be react-server but got client');
  });
}); 