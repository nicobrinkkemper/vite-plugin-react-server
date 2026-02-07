import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // Run serially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30000,
  
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run bidoof-template dev server before tests
  webServer: {
    command: 'npm run test:e2e:server',
    url: 'http://localhost:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 60000, // Give more time for server startup
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
