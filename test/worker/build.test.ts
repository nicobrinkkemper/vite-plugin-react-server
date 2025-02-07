import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { resolve } from 'node:path';
import { reactWorkerPlugin } from '../../plugin/worker/plugin.js';
import { testConfig } from '../fixtures/test-config.js';
import { setupTestProject } from '../setup.js';

describe('worker build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/');

  beforeAll(async () => {
    await setupTestProject(testDir)
  })

  it('builds workers successfully', async () => {
    const buildMeta = await build({
      root: testDir,
      plugins: [reactWorkerPlugin(testConfig)],
      build: {
        emptyOutDir: false,
      }
    }) as any;
    const output = Array.isArray(buildMeta) ? buildMeta[0].output : buildMeta.output;
    // Check worker build output
    if(Array.isArray(output)){ 
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThanOrEqual(2); // html-worker and rsc-worker
      expect(output.map(o => o.fileName)).toContain('html-worker.js');
      expect(output.map(o => o.fileName)).toContain('rsc-worker.js');
    } else {
      throw new Error('Worker build failed')
    }
  });
}); 