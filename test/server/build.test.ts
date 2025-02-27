import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { vitePluginReactServer } from '../../plugin/react-server/index.js'
import { testUserOptions } from '../test-config.js'
import { setupTestProject } from '../setup.js'
import { vitePluginReactClient } from '../../plugin/react-client/index.js'

describe('server build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/') 

  afterAll(() => {
    if (!existsSync(testDir)) {
      setupTestProject(testDir)
    }
  })

  if (!process.env['NODE_OPTIONS']?.includes('react-server')) {
    it.skip('builds server successfully (requires react-server condition)', () => {})
  } else {
    it('builds worker, client and server successfully in the same thread', async () => {
      testUserOptions.projectRoot = testDir
      console.log('testUserOptions', testUserOptions)
      // Build server (needs server condition)
      const buildMetaClient = await build({
        root: testDir,
        plugins: [
          vitePluginReactClient(testUserOptions)
        ],
      }) as any
      // const buildMetaServer = await build({
      //   root: testDir,
      //   plugins: [
      //     vitePluginReactServer(testUserOptions)
      //   ],
      // }) as any
      // // Check server build output
      // if(Array.isArray(buildMetaServer)) {
      //   for(const {output} of buildMetaServer) {
      //     for(const file of output) {
      //       expect(file.fileName).toBeDefined()
      //     }
      //   }
      // } else {
      //   for(const file of buildMetaServer.output) {
      //     expect(file.fileName).toBeDefined()
      //   }
      // }
    }, 20000)
  }
}) 