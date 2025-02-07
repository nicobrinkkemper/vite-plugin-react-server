import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { reactServerPlugin } from '../../plugin/react-server/plugin.js'
import { reactClientPlugin } from '../../plugin/react-client/plugin.js'
import { testConfig } from '../fixtures/test-config.js'
import { reactWorkerPlugin } from '../../plugin/worker/plugin.js'

describe('server build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/')
  

  afterAll(() => {
    if (existsSync(testDir)) {
      // rmSync(testDir, { recursive: true, force: true })
    }
  })

  if (!process.env['NODE_OPTIONS']?.includes('react-server')) {
    it.skip('builds server successfully (requires react-server condition)', () => {})
  } else {
    it('builds worker, client and server successfully in the same thread', async () => {
      const workerPlugin = reactWorkerPlugin(testConfig)

      // Build workers (no server condition needed)
      const buildMetaWorker = await build({
        root: testDir,
        plugins: [workerPlugin],
        build: {
          emptyOutDir: false,
        }
      }) as any
      const output = Array.isArray(buildMetaWorker) ? buildMetaWorker[0].output : buildMetaWorker.output;
      // Check worker build output (no server condition needed but doesn't matter if it has it)
      expect(output).toBeDefined()
      expect(output.length).toBeGreaterThanOrEqual(2) // html-worker and rsc-worker
      expect(output.map(o => o.fileName)).toContain('html-worker.js')
      expect(output.map(o => o.fileName)).toContain('rsc-worker.js')

      // Build client (no server condition needed but doesn't matter if it has it)
      const clientPlugin = reactClientPlugin(testConfig)
      const buildMetaClient = await build({
        root: testDir,
        plugins: [clientPlugin],
        build: {
          emptyOutDir: false,
        }
      }) as any

      // Check client build output
      expect(buildMetaClient.output).toBeDefined()
      expect(buildMetaClient.output.some(o => 
        o.fileName.includes('index.js') || // Check for index.js
        o.fileName.includes('assets/') // Check for assets directory
      )).toBe(true)

      const serverPlugin = reactServerPlugin(testConfig)

      // Build server (needs server condition)
      const buildMetaServer = await build({
        root: testDir,
        plugins: [serverPlugin],
        build: {
          emptyOutDir: false,
          ssr: true,
        }
      }) as any
      // Check server build output
      expect(buildMetaServer.output).toBeDefined()
      expect(buildMetaServer.output.some(o => 
        o.fileName.includes('server.js')  // Look for client.js specifically
      )).toBe(true)
    })
  }
}) 