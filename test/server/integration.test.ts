import { describe, it, expect, afterAll } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { reactStreamPlugin } from '../../src'
import fs from 'node:fs/promises'

describe('server integration', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project')
  
  afterAll(async () => {
    console.log('Cleaning up test project in:', testDir)
    try {
      await fs.stat(testDir)
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {
      // Directory doesn't exist, that's fine
    }
  })

  if (!process.env.NODE_OPTIONS?.includes('react-server')) {
    it.skip('builds with RSC plugin (requires react-server condition)', () => {})
  } else {
    it('builds with RSC plugin', async () => {
      const plugin = await reactStreamPlugin({
        moduleBase: 'src',
        Page: 'src/page/page.tsx',
        props: 'src/page/props.ts',
        build: {
          pages: ['/']
        }
      })

      const outDir = resolve(testDir, 'dist/server')
      try {
        await fs.mkdir(outDir, { recursive: true })

        await build({
          root: testDir,
          plugins: [plugin],
          build: {
            ssr: true,
            outDir: 'dist/server',
            rollupOptions: {
              input: {
                client: resolve(testDir, 'src/client.tsx'),
                page: resolve(testDir, 'src/page/page.tsx')
              }
            }
          },
          mode: 'production',
          configFile: false
        })

        // Check relative to testDir
        try {
          await fs.stat(outDir)
          const files = await fs.readdir(outDir)
          console.log('Files in directory:', files)
        } catch (e) {
          console.error('Error reading directory:', e)
        }

        // Verify files exist
        await fs.stat(outDir)
        await fs.stat(resolve(outDir, 'client.js'))
        await fs.stat(resolve(outDir, 'page.js'))

        // Check content to verify client/server boundary
        const clientOutput = await fs.readFile(resolve(outDir, 'client.js'), 'utf-8')
        const pageOutput = await fs.readFile(resolve(outDir, 'page.js'), 'utf-8')

        // Client component should be transformed to a client reference
        expect(clientOutput).toContain('Client Component')
        
        // Server component should import the client component
        expect(pageOutput).toContain('Server Page with client component')
      } catch (e) {
        console.error('Test failed:', e)
        throw e
      }
    })
  }
}) 