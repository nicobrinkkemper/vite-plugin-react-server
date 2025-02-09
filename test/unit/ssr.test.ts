import { describe, it, expect } from 'vitest'
import { testConfig } from '../test-config.js'
import { resolveUserConfig } from '../../plugin/config/resolveUserConfig.js'

describe('SSR configuration', () => {
  it('sets ssr=true for react-server condition', () => {
    const result = resolveUserConfig({
      condition: 'react-server',
      config: {},
      configEnv: { command: 'serve', mode: 'development', isSsrBuild: true },
      userOptions: testConfig  
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=false for react-client condition', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {},
      configEnv: { command: 'build', mode: 'production' },
      userOptions: testConfig
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(false)
    }
  })

  it('errors when using server plugin without ssr flag', () => {
    const result = resolveUserConfig({
      condition: 'react-server',
      config: {},
      configEnv: { command: 'build', mode: 'production' },
      userOptions: testConfig}
    )

  })

}) 