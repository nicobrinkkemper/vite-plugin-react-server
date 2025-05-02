import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { testUserOptions } from '../test-config.js'
import { setupTestProject } from '../setup.js'
import { vitePluginReactClient } from 'vite-plugin-react-server/client'
import { resolveUserConfig } from '../../plugin/config/resolveUserConfig.js'
import { existsSync, rmSync } from 'node:fs'
import { resolveOptions } from '../../plugin/config/resolveOptions.js'

describe('server build', async () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/') 

  beforeEach(async () => {
    await setupTestProject(testDir)
  })
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('builds client', async () => {
    testUserOptions.projectRoot = testDir
    
    // Change to test directory before building
    const originalCwd = process.cwd()
    process.chdir(testDir)
    
    await build({
      plugins: [
        vitePluginReactClient(testUserOptions)
      ]
    }) as any

    // Restore original working directory
    process.chdir(originalCwd)
  }, 20000)
})

describe('Build configuration', () => {
  const testDir = resolve(__dirname, '../fixtures/unit-build-test/')

  beforeEach(async () => {
    await setupTestProject(testDir)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('sets build configuration correctly', () => {
    const result = resolveUserConfig({
      condition: 'react-server',
      config: {},
      configEnv: { command: 'build', mode: 'development', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions, 'react-server')?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build).toBeDefined()
      expect(result.userConfig.build.assetsDir).toBeDefined()
      expect(result.userConfig.build.outDir).toBeDefined()
    }
  })
}) 