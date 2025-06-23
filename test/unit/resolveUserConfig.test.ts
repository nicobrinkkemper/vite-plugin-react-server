import { describe, it, expect} from 'vitest'
import { testUserOptions } from '../test-config.js'
import { resolveUserConfig } from '../../dist/plugin/config/resolveUserConfig.js'
import { resolveOptions } from '../../dist/plugin/config/resolveOptions.js'


describe('Build configuration', () => {
  it('sets build configuration correctly', () => {
    const result = resolveUserConfig({
      condition: 'react-server',
      config: {},
      configEnv: { command: 'build', mode: 'development', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions)?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
        staticManifest: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build).toBeDefined()
      expect(result.userConfig.build.assetsDir).toBeDefined()
      expect(result.userConfig.build.outDir).toBeDefined()
    }
  })

  
  it('sets ssr=true for react-server condition', () => {
    const result = resolveUserConfig({
      config: {},
      condition: 'react-server',
      configEnv: { command: 'serve', mode: 'development', isSsrBuild: true },
      userOptions: resolveOptions(testUserOptions)?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
        staticManifest: {},
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
      userOptions: resolveOptions(testUserOptions)?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
        staticManifest: {},
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
      userOptions: resolveOptions(testUserOptions)?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
        staticManifest: {},
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
      userOptions: resolveOptions(testUserOptions)?.['userOptions'],
      autoDiscoveredFiles: {
        inputs: {},
        staticManifest: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(false)
    }
  })
}) 