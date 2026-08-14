import { describe, it, expect } from 'vitest';

describe('#env (condition-split env source)', () => {
  it('resolves to a defined env with a root BASE_URL', async () => {
    // `env` is re-exported from the /utils barrel and resolved via package.json
    // `imports` → `#env` (browser: import.meta.env; Node/edge: process.env). Under
    // the test's node condition it's env.node, whose BASE_URL defaults to "/".
    const envModule = await import('vite-plugin-react-server/utils');

    expect(envModule).toBeDefined();
    expect(envModule.env).toBeDefined();
    // env.node reads the mirrored VITE_BASE_URL live, so the assertion must
    // follow the environment — a literal '/' made this test fail under the
    // test-base-url rerun the moment that script actually set the base.
    expect(envModule.env.BASE_URL).toBe(process.env.VITE_BASE_URL || '/');
  });
}); 