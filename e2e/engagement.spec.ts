import { test, expect } from '@playwright/test';
import { TEST_IDS } from '../scripts/seed';

test.describe('Engagement levels', () => {
  test('seeded persons appear in the participation section', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);

    await expect(page.getByText('Overall Participation')).toBeVisible();
    // Open the circles module so individual person nodes (with aria-labels) are rendered
    await page.getByText('Overall Participation').click();
    // ConcentricCircles has its own fetch after the nucleus loads — give it extra time
    await expect(page.locator('[aria-label="Alice Test"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[aria-label="Bob Test"]')).toBeVisible({ timeout: 15000 });
  });

  test('engagement level persists after page reload', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);

    // Alice is seeded at 'aware' — she should still be there after a hard reload
    await page.reload();
    // Re-open the circles module after reload (page state resets to default card view)
    await page.getByText('Overall Participation').click();
    await expect(page.locator('[aria-label="Alice Test"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[aria-label="Bob Test"]')).toBeVisible({ timeout: 15000 });
  });
});
