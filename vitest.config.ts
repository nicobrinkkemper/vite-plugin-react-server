import { defineConfig } from 'vitest/config'

export default defineConfig({
  mode: 'development',
  test: {
    globals: true,
    hookTimeout: 10000,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    
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
      'test/**/*.spec.ts',
      'test/**/*.test.tsx',
      'test/**/*.spec.tsx'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      process.env['NODE_OPTIONS']?.includes('react-server') ? 'test/client/*' : 'test/server/*'
    ],
    typecheck: {
      include: [  
        'test/**/*.test.ts',
        'test/**/*.spec.ts',
        'test/**/*.test.tsx',
        'test/**/*.spec.tsx'
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**'
      ]
    }
  }
}) 