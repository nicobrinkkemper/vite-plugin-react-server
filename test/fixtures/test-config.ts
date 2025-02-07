import { join, relative } from "path";
import { ResolvedUserOptions } from "../../plugin/types.js";

export const testDir = join(process.cwd(), 'test/fixtures/test-project')
export const testConfig = {
  moduleBase: 'src',
  moduleBasePath: '/src',
  moduleBaseURL: '/src',
  projectRoot: testDir,
  moduleBaseExceptions: [],
  htmlWorkerPath: '../../../plugin/worker/html-worker.tsx',
  rscWorkerPath: '../../../plugin/worker/rsc-worker.tsx',
  loaderPath: '../../../plugin/worker/loader.ts',
  build: {
    pages: ['/'],
    client: 'dist/client',
    server: 'dist/server',
    static: 'dist/static'
  },
  Page: 'src/page/page.tsx',
  props: 'src/page/props.ts',
  Html: ({ children }: { children: any }) => children,
  pageExportName: 'Page',
  propsExportName: 'props',
  collectCss: true,
  collectAssets: true,
  assetsDir: 'assets',
  clientEntry: 'src/client.tsx',
  serverEntry: 'src/server.tsx',
  autoDiscover: {
    pagePattern: /\.page\.tsx$/,
    propsPattern: /\.props\.ts$/,
    clientComponents: /\.client\.tsx$/,
    serverFunctions: /\.server\.tsx$/
  }
} satisfies ResolvedUserOptions
console.log(testConfig.projectRoot)