const { expect, test } = require('@playwright/test')

test('trade terminal renders core widgets and auth modal', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('TradeOff').first()).toBeVisible()
  await expect(page.getByText('Order Book')).toBeVisible()
  await expect(page.getByText('Market Trades')).toBeVisible()
  await expect(page.getByText('Spot', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Get started' }).click()
  await expect(page.getByRole('heading', { name: 'Create your TradeOff account' })).toBeVisible()
})

test('portfolio and wallets routes render dashboard shells', async ({ page }) => {
  await page.goto('/portfolio')
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  await expect(page.getByText('Total balance')).toBeVisible()
  await expect(page.getByText('Allocation', { exact: true })).toBeVisible()

  await page.goto('/wallets')
  await expect(page.getByRole('heading', { name: 'Wallets' })).toBeVisible()
  await expect(page.getByText('Mock Deposit', { exact: true })).toBeVisible()
  await expect(page.getByText('Withdraw', { exact: true })).toBeVisible()
})
