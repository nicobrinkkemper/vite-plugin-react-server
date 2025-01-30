import { describe, it, expect } from 'vitest'
import { reactStreamPlugin } from '../../src'

describe('reactStreamPlugin', () => {
  it('creates a valid vite plugin', async () => {
    const plugin = await reactStreamPlugin({
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
    await expect(reactStreamPlugin({
      moduleBase: '/src', // Invalid path - should throw
      Page: 'src/page.tsx',
      props: 'src/props.ts',
      build: {
        pages: ['/']
      }
    })).rejects.toThrow()
  })
}) 