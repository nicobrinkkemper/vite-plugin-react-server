import { describe, it, expect, beforeAll } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { testConfig } from '../fixtures/test-config.js'
import { reactClientPlugin } from '../../plugin/react-client/plugin.js'
import { reactWorkerPlugin } from '../../plugin/worker/plugin.js'

describe('client build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/')

  it('builds client successfully', async () => {
    const buildMetaWorker = await build({
      root: testDir,
      plugins: [reactWorkerPlugin(testConfig)],
      build: {
        emptyOutDir: false,
      }
    }) as any
    const output = Array.isArray(buildMetaWorker) ? buildMetaWorker[0].output : buildMetaWorker.output;

    // Check worker build output
    if(Array.isArray(output)){
      expect(output).toBeDefined();
      expect(output.map(o => o.fileName)).toContain('html-worker.js');
      expect(output.map(o => o.fileName)).toContain('rsc-worker.js');
    } else {
      throw new Error('Worker build failed')
    }

    // Use the built worker path for client build
    const buildMetaClient = await build({
      root: testDir,
      plugins: [reactClientPlugin(testConfig)],
      build: {
        emptyOutDir: false,
      }
    }) as any

    expect(buildMetaClient.output).toBeDefined()
    expect(buildMetaClient.output.some(o => 
      o.fileName.includes('index') || 
      o.fileName.includes('assets/')
    )).toBe(true)
  })
}) 