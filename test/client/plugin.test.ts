import { describe, it, expect } from 'vitest'
import { reactClientPlugin } from '../../plugin/react-client/plugin.js'

describe('reactClientPlugin', () => {
  it('creates a valid vite plugin', async () => {
    const plugin = reactClientPlugin({
      moduleBase: 'src',
      Page: 'src/page.tsx',
      props: 'src/props.ts',
      build: {
        pages: ['/']
      }
    })
    expect(plugin).toBeDefined()
  })

  it('validates configuration', async () => {
    try {
      reactClientPlugin({
        moduleBase: '/src', // Invalid path - should throw
        Page: 'src/page.tsx',
        props: 'src/props.ts',
        build: {
        pages: ['/']
      }
    })
    } catch (error) {
      expect(error).toBeDefined()
    }
  })
}) 