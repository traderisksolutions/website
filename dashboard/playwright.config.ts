/**
 * Journey tests: the user journeys that must never break, run in a real browser against a
 * production build (`next start`) on the live database. Read-only: no journey writes a record.
 * Run before every deploy (scripts/deploy-check.sh); a failed journey blocks the deploy.
 * Each test names the behaviour IDs it guards (docs/behaviours.md).
 */
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.JOURNEY_PORT ?? 3118)

export default defineConfig({
  testDir: 'tests/journeys',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  globalSetup: './tests/journeys/global-setup.ts',
  use: {
    baseURL: process.env.JOURNEY_BASE_URL ?? `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    storageState: 'tests/journeys/.auth.json',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
})
