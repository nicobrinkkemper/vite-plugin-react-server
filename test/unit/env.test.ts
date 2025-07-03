import { describe, it, expect } from 'vitest';

describe('env.ts', () => {
  it('should export import.meta.env', async () => {
    
    // We need to dynamically import the module since it uses import.meta.env
    const envModule = await import('vite-plugin-react-server/utils');
    
    // The env should be available (though it may be undefined in test environment)
    expect(envModule).toBeDefined();
    expect(envModule.env).toBeDefined();
    expect(envModule.env.BASE_URL).toBe('/');
  });
}); 