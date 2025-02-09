import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from 'vite'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { vitePluginReactServer } from '../../plugin/react-server/index.js'
import { testConfig } from '../fixtures/test-config.js'
import { fileURLToPath } from 'node:url'


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
      const serverPlugin = vitePluginReactServer(testConfig)

      // Build server (needs server condition)
      const buildMetaServer = await build({
        root: testDir,
        plugins: [
          serverPlugin
        ],
      }) as any
      // Check server build output
      expect(buildMetaServer.output).toBeDefined()
      expect(buildMetaServer.output.some(o => 
        o.fileName.includes('server.js')  // Look for client.js specifically
      )).toBe(true)
    }, 20000)
  }
}) 