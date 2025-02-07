import { describe, it, expect } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { reactServerPlugin } from '../../plugin/react-server/plugin.js'
import { reactClientPlugin } from '../../plugin/react-client/plugin.js'
import { testConfig } from '../fixtures/test-config.js'
describe('server integration', () => {
  if (!process.env['	NODE_OPTION']?.includes('react-server')) {
    it.skip('builds with RSC plugin (requires react-server condition)', () => {})
    return
  }
  const testDir = resolve(__dirname, '../fixtures/test-project/')
  it('builds with RSC plugin', async () => {


    const serverPlugin = reactServerPlugin(testConfig)    
    const clientPlugin = reactClientPlugin(testConfig)

    await build({
      root: testDir,
      plugins: [clientPlugin],
    })

    const rollupOutput = await build({
      root: testDir,
      plugins: [serverPlugin],
      build: {
        emptyOutDir: false,
      }
    }).then(async (rollupOutput) => {
      return rollupOutput
    })
    const hasOutput = 'output' in rollupOutput  
    // Verify output exists
    expect(hasOutput).toBe(true)
    if(hasOutput) {
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
    }
  })
}) 