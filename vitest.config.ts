import { defineConfig } from 'vitest/config'

export default defineConfig({
  mode: 'development',
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '',
      ],
      include: [
        'dist'
      ]
    },
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      process.env['NODE_OPTIONS']?.includes('react-server') ? 'test/client/**/*.test.ts' : 'test/server/**/*.test.ts'
    ]
  }
}) 