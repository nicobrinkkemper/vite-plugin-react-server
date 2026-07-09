import { describe, it, expect } from 'vitest';

describe('#env (condition-split env source)', () => {
  it('resolves to a defined env with a root BASE_URL', async () => {
    // `env` is re-exported from the /utils barrel and resolved via package.json
    // `imports` → `#env` (browser: import.meta.env; Node/edge: process.env). Under
    // the test's node condition it's env.node, whose BASE_URL defaults to "/".
    const envModule = await import('vite-plugin-react-server/utils');

    expect(envModule).toBeDefined();
    expect(envModule.env).toBeDefined();
    expect(envModule.env.BASE_URL).toBe('/');
  });
}); 