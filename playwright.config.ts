import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  maxFailures: 1, // Stop on first failure — prevents cascading errors after app closes
  use: {
    trace: 'on',
    video: 'on'
  }
})
