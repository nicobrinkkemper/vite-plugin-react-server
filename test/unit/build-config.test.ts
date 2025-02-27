import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest'
import { testUserOptions } from '../test-config.js'
import { resolveUserConfig } from '../../plugin/config/resolveUserConfig.js'
import { existsSync } from 'node:fs'
import { setupTestProject } from '../setup.js'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { before } from 'node:test'

describe('Build configuration', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/')

  before(() => {
    if (!existsSync(testDir)) {
      setupTestProject(testDir)
    }
  })

  it('uses server outDir for server builds', () => {
    const result = resolveUserConfig({
      config: {
        root: testDir,
      },
      configEnv: { command: 'build', isSsrBuild: true, mode: 'production' },
      userOptions: testUserOptions
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.outDir).toBe('dist/server')
    }
  })

  it('uses client outDir for client builds', () => {
    const result = resolveUserConfig({
      isClient: true,
      config: {
        root: testDir,
      },
      configEnv: { command: 'build', mode: 'production', isSsrBuild: false },
      userOptions: testUserOptions
    })
    if(process.env['NODE_OPTION']?.match(/--conditions=react-server/)) {
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toBe('Vite was run with the react-server condition, but is making a client build.')
      }
    } else {
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        expect(result.userConfig.build.outDir).toBe('dist/client')
      }
    }
  })
}) 