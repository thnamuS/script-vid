import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  workers: 2,
  expect: { timeout: 15000 },
  use: { baseURL: process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
