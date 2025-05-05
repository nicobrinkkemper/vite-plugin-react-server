import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest'
import { testUserOptions } from '../test-config.js'
import { resolveUserConfig } from '../../plugin/config/resolveUserConfig.js'
import { existsSync, rmSync } from 'node:fs'
import { setupTestProject } from '../setup.js'
import { rmdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ResolvedUserOptions } from '../../plugin/types.js'
import { resolveOptions } from '../../plugin/config/resolveOptions.js'

describe('SSR configuration', () => {
  const testDir = resolve(__dirname, '../fixtures/ssr-test/')

  beforeEach(async () => {
    await setupTestProject(testDir)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('sets ssr=true for react-server condition', () => {
    const result = resolveUserConfig({
      config: {},
      condition: 'react-server',
      configEnv: { command: 'serve', mode: 'development', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions, 'react-server')?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=true for react-client condition when explicitly set to true using isSsrBuild', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {},
      configEnv: { command: 'build', mode: 'development', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions, 'react-client')?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=true for react-client when {ssr:true} is set in user config', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {
        build: {
          ssr: true
        }
      },
      configEnv: { command: 'build', mode: 'development', isSsrBuild: false },
      userOptions: resolveOptions(testUserOptions, 'react-client')?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  
  it('sets ssr=false when explicitly set to false', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {
        build: {
          ssr: false
        }
      },
      configEnv: { command: 'build', mode: 'development', isSsrBuild: false },
      userOptions: resolveOptions(testUserOptions, 'react-client')?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(false)
    }
  })
}) 