const { existsSync } = require('fs')
const { defineConfig } = require('@playwright/test')

const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const executablePath = chromeCandidates.find((candidate) => existsSync(candidate))

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3002',
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
})
