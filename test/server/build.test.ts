import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { reactStreamPlugin } from '../../src/react-server/plugin.js'
import { reactStreamPlugin as clientReactStreamPlugin } from '../../src/react-client/plugin.js'

describe('server build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/')
  
  beforeAll(async () => {
    
    // Wait for test project setup to complete
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  if (!process.env.NODE_OPTIONS?.includes('react-server')) {
    it.skip('builds server successfully (requires react-server condition)', () => {})
  } else {
    it('builds server successfully', async () => {
      const config = {
        moduleBase: 'src',
        Page: 'src/page/page.tsx',
        props: 'src/page/props.ts',
        projectRoot: testDir,
        workerPath: resolve(__dirname, '../../src/worker/worker.tsx'),
        loaderPath: resolve(__dirname, '../../src/worker/loader.ts'),
        build: {
          pages: ['/']
        }
      }
      const serverPlugin = await reactStreamPlugin(config)
      const clientPlugin = await clientReactStreamPlugin(config)

      // Build client first
      await build({
        root: testDir,
        plugins: [clientPlugin],
      })

      // Then build server
      await build({
        root: testDir,
        plugins: [serverPlugin],
        build: {
          ssr: true,
          outDir: 'dist/server',
          manifest: true,
          rollupOptions: {
            input: {
              page: 'src/page/page.tsx',
              client: 'src/client.tsx',
              worker: '../../../src/worker/worker.tsx',
              loader: '../../../src/worker/loader.ts'
            }
          }
        }
      })

      const serverDir = resolve(testDir, 'dist/server')
      expect(existsSync(serverDir)).toBe(true)
      expect(existsSync(resolve(serverDir, 'client.js'))).toBe(true)
      expect(existsSync(resolve(serverDir, 'page.js'))).toBe(true)
    })
  }
}) 