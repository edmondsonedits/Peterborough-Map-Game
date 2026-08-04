import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /phase[1-5]-playwright\.spec\.mjs/,
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python -m http.server 4173 --directory ../..',
    url: 'http://127.0.0.1:4173/gta-fire-response/?test=1',
    reuseExistingServer: true,
    timeout: 10000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width:1366, height:768 } } }
  ]
});
