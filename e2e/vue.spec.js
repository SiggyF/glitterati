import { test, expect } from '@playwright/test'

test('loads the Glitterati board', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Glitterati')).toBeVisible()
  await expect(page.getByText('Bundled puzzles')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sunrise Stripes' })).toBeVisible()
})
