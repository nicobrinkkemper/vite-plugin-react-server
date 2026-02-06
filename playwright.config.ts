import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // Run serially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  
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

  // Run dev server before tests
  webServer: {
    command: 'npm run test:e2e:server',
    url: 'http://localhost:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
