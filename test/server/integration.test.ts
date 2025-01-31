import { describe, it, expect } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { reactStreamPlugin } from '../../src/react-server/plugin'
import { reactStreamPlugin as clientReactStreamPlugin } from '../../src/react-client/plugin'
describe('server integration', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/')
  

  if (!process.env.NODE_OPTIONS?.includes('react-server')) {
    it.skip('builds with RSC plugin (requires react-server condition)', () => {})
  } else {
    it('builds with RSC plugin', async () => {
      const config = {
        moduleBase: 'src',
        Page: 'src/page/page.tsx',
        props: 'src/page/props.ts',
        workerPath: '../../../src/worker/worker.tsx',
        loaderPath: '../../../src/worker/loader.ts',
        projectRoot: testDir,
        build: {
          pages: ['/']
        }
      }

      const serverPlugin = await reactStreamPlugin(config)
      const clientPlugin = await clientReactStreamPlugin(config)

      const clientRollupOutput = await build({
        root: testDir,
        plugins: [clientPlugin],
      })

      const rollupOutput = await build({
        root: testDir,
        plugins: [serverPlugin],
        build: {
          ssr: true,
          manifest: true,
          rollupOptions: {
            input: {
              client: 'src/client.tsx',
              page: 'src/page/page.tsx',
              worker: '../../../src/worker/worker.tsx',
              loader: '../../../src/worker/loader.ts'
            }
          }
        },
        mode: 'production',
        configFile: false
      }).then(async (rollupOutput) => {
        return rollupOutput
      })

      // Verify output exists
      expect('output' in rollupOutput).toBe(true)
      
      expect(rollupOutput['output'].length).toBe(11)

      // Get all JS chunk filenames (excluding manifest files)
      const jsChunks = rollupOutput['output'].filter(o => o.type === 'chunk')
      const filenames = jsChunks.map(o => o.fileName)

      // Verify we have the expected JS files
      expect(filenames).toContain('client.js')
      expect(filenames).toContain('page.js')
      expect(filenames.length).toBe(9)

      // Verify manifest files
      const manifestFiles = rollupOutput['output']
        .filter(o => o.type === 'asset')
        .map(o => o.fileName)
      expect(manifestFiles).toContain('.vite/manifest.json')
      expect(manifestFiles).toContain('.vite/ssr-manifest.json')
    })
  }
}) 