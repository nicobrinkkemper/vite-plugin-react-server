import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { reactStreamPlugin } from '../../src'

describe('server build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project')
  
  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  if (!process.env.NODE_OPTIONS?.includes('react-server')) {
    it.skip('builds server successfully (requires react-server condition)', () => {})
  } else {
    it('builds server successfully', async () => {
      const plugin = await reactStreamPlugin({
        moduleBase: 'src',
        Page: 'src/page/page.tsx',
        props: 'src/page/props.ts',
        build: {
          pages: ['/']
        }
      })

      await build({
        root: testDir,
        plugins: [plugin],
        logLevel: 'error',
        build: {
          ssr: true,
          outDir: 'dist/server',
          rollupOptions: {
            input: {
              page: resolve(testDir, 'src/page/page.tsx'),
              client: resolve(testDir, 'src/client.tsx')
            }
          }
        },
        mode: 'production',
        configFile: false
      })

      const serverDir = resolve(testDir, 'dist/server')
      expect(existsSync(serverDir)).toBe(true)
      expect(existsSync(resolve(serverDir, 'client.js'))).toBe(true)
      expect(existsSync(resolve(serverDir, 'page.js'))).toBe(true)
    })
  }
}) 