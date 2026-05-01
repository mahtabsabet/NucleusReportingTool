import { test, expect } from '@playwright/test';
import { TEST_IDS } from '../scripts/seed';

test.describe('Activity flow', () => {
  test('nucleus dashboard loads with seeded data', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/debug-after-goto.png', fullPage: true });

    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible();
    await expect(page.getByText("Test Children's Class")).toBeVisible();
    await expect(page.getByText('Alice Test')).toBeVisible();
    await expect(page.getByText('Bob Test')).toBeVisible();
  });

  test('can add a person to an activity', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}/activity/${TEST_IDS.activityId}`);
    await expect(page.getByRole('heading', { name: "Test Children's Class" })).toBeVisible();

    // Add a teacher using the first "Add new name..." input (Teachers section)
    const nameInput = page.getByPlaceholder('Add new name...').first();
    await nameInput.fill('Charlie Test');
    await nameInput.press('Enter');

    // Person should appear in the participant list
    await expect(page.getByText('Charlie Test')).toBeVisible();
  });

  test('person added to activity appears in nucleus enrollment', async ({ page }) => {
    // Charlie was added in the previous test; they should now be enrolled in the nucleus
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByText('Charlie Test')).toBeVisible();
  });
});
