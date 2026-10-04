import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  timeout: 30000, reporter: 'list', outputDir: '.local/test-results/browser',
  use: { baseURL: process.env.BASE_URL || 'http://localhost:3107', channel: 'chrome', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' }
});
