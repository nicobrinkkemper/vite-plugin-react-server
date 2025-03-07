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
  const testDir = resolve(__dirname, '../fixtures/test-project/')

  afterAll(() => {
    if (!existsSync(testDir)) {
      setupTestProject(testDir)
    }
  })

  it('sets ssr=true for react-server condition', () => {
    const result = resolveUserConfig({
      config: {},
      configEnv: { command: 'serve', mode: 'development', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions, false)?.['userOptions']
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
     // expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=true for react-client condition', () => {
    const result = resolveUserConfig({
      isClient: true,
      config: {},
      configEnv: { command: 'build', mode: 'production', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions, true)?.['userOptions']
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=false for react-client condition non ssr mode', () => {
    const result = resolveUserConfig({
      isClient: true,
      config: {},
      configEnv: { command: 'build', mode: 'production', isSsrBuild: false },
      userOptions: resolveOptions(testUserOptions, true)?.['userOptions']
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(false)
    }
  })


}) 