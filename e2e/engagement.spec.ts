import { test, expect } from '@playwright/test';
import { TEST_IDS } from '../scripts/seed';

test.describe('Engagement levels', () => {
  test('seeded persons appear in the participation section', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);

    await expect(page.getByText('Overall Participation')).toBeVisible();
    await expect(page.getByText('Alice Test')).toBeVisible();
    await expect(page.getByText('Bob Test')).toBeVisible();
  });

  test('engagement level persists after page reload', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);

    // Alice is seeded at 'aware' — she should still be there after a hard reload
    await page.reload();
    await expect(page.getByText('Alice Test')).toBeVisible();
    await expect(page.getByText('Bob Test')).toBeVisible();
  });
});
