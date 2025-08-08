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
    
    const serverModule = await import('vite-plugin-react-server/server');
    
    expect(serverModule.vitePluginReactServer).toBeDefined();
    expect(typeof serverModule.vitePluginReactServer).toBe('function');
  });

  it('should export plugin when NODE_OPTIONS contains react-server with equals', async () => {
    process.env.NODE_OPTIONS = '--conditions=react-server';
    
    const serverModule = await import('vite-plugin-react-server/server');
    
    expect(serverModule.vitePluginReactServer).toBeDefined();
    expect(typeof serverModule.vitePluginReactServer).toBe('function');
  });

  it('should handle complex NODE_OPTIONS with react-server', async () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --conditions react-server --experimental-modules';
    
    const serverModule = await import('vite-plugin-react-server/server');
    
    expect(serverModule.vitePluginReactServer).toBeDefined();
    expect(typeof serverModule.vitePluginReactServer).toBe('function');
  });

}); 