import { describe, it, expect } from 'vitest'
import { testConfig } from '../fixtures/test-config.js'
import { resolveUserConfig } from '../../plugin/config/resolveUserConfig.js'

describe('Build configuration', () => {

  it('uses server outDir for server builds', () => {
    const result = resolveUserConfig({
      condition: 'react-server',
      config: {},
      configEnv: { command: 'build', isSsrBuild: true, mode: 'production' },
      userOptions: testConfig
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.outDir).toBe('dist/server')
    }
  })

  it('uses client outDir for client builds', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {},
      configEnv: { command: 'build', mode: 'production', isSsrBuild: false },
      userOptions: testConfig
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