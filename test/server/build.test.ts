import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { vitePluginReactServer } from '../../plugin/react-server/index.js'
import { testConfig } from '../test-config.js'
import { setupTestProject } from '../setup.js'


describe('server build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/')

  afterAll(() => {
    if (existsSync(testDir)) {
      // rmSync(testDir, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    setupTestProject(testDir)
  })

  if (!process.env['NODE_OPTIONS']?.includes('react-server')) {
    it.skip('builds server successfully (requires react-server condition)', () => {})
  } else {
    it('builds worker, client and server successfully in the same thread', async () => {
      const serverPlugin = vitePluginReactServer(testConfig)

      // Build server (needs server condition)
      const buildMetaServer = await build({
        plugins: [
          serverPlugin
        ],
      }) as any
      // Check server build output
      for(const {output} of buildMetaServer) {
        for(const file of output) {
          expect(file.fileName).toBeDefined()
        }
      }
    }, 20000)
  }
}) 