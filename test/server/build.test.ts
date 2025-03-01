import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { vitePluginReactServer } from '../../plugin/react-server/index.js'
import { testUserOptions } from '../test-config.js'
import { setupTestProject } from '../setup.js'
import { vitePluginReactClient } from '../../plugin/react-client/index.js'

describe('server build', async () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/') 

  beforeEach(() => {
    setupTestProject(testDir)
  })
  afterEach(() => {
    // rmSync(testDir, { recursive: true, force: true })
  })

  it('builds client', async () => {
    testUserOptions.projectRoot = testDir
    
    // Change to test directory before building
    const originalCwd = process.cwd()
    process.chdir(testDir)
    
    const buildMetaClient = await build({
      plugins: [
        vitePluginReactClient(testUserOptions)
      ]
    }) as any

    await build({
      plugins: [
        vitePluginReactServer(testUserOptions)
      ]
    }) as any


    // Restore original working directory
    process.chdir(originalCwd)
  }, 20000)
}) 