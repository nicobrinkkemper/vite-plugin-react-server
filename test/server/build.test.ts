import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { vitePluginReactServer } from '../../plugin/react-server/index.js'
import { testUserOptions } from '../test-config.js'
import { setupTestProject } from '../setup.js'
import { vitePluginReactClient } from '../../plugin/react-client/index.js'
import { readFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'

describe('server build', async () => {
  const testDir = resolve(__dirname, '../fixtures/test-project/') 

  beforeEach(() => {
    setupTestProject(testDir)
  })
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('builds client', async () => {
    testUserOptions.projectRoot = testDir
    
    // Change to test directory before building
    const originalCwd = process.cwd()
    process.chdir(testDir)
    
    await build({
      plugins: [
        vitePluginReactClient(testUserOptions)
      ]
    }) as any

    await build({
      plugins: [
        vitePluginReactServer(testUserOptions)
      ]
    }) as any

    // Verify static build output
    const staticDir = resolve(testDir, 'dist/static')
    const htmlContent = await readFile(resolve(staticDir, 'index.html'), 'utf-8')
    const rscContent = await readFile(resolve(staticDir, 'index.rsc'), 'utf-8')

    // Check that HTML includes the client entry script
    expect(htmlContent).toContain('<script type="module" src="./index')
    
    // Check that HTML includes the CSS module
    expect(htmlContent).toContain('test.module')
    
    // Check that the page content is rendered
    expect(htmlContent).toContain('Page')

    // Check that the page content is rendered
    expect(rscContent).toContain('CssCollector')

    // Restore original working directory
    process.chdir(originalCwd)
  }, 20000)
}) 