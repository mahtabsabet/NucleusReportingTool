import { test, expect } from '@playwright/test';
import { TEST_IDS } from '../scripts/seed';

test.describe('Activity flow', () => {
  test('nucleus dashboard loads with seeded data', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);

    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible();
    await expect(page.getByText("Test Children's Class")).toBeVisible({ timeout: 15000 });
    // Open the circles module so individual person nodes (with aria-labels) are rendered
    await page.getByText('Overall Participation').click();
    // ConcentricCircles fires its own fetch after the nucleus loads
    await expect(page.locator('[aria-label="Alice Test"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[aria-label="Bob Test"]')).toBeVisible({ timeout: 15000 });
  });

  test('can add a person to an activity', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}/activity/${TEST_IDS.activityId}`);
    await expect(page.getByRole('heading', { name: "Test Children's Class" })).toBeVisible({ timeout: 15000 });

    // Add a teacher using the first "Add name..." input (Teachers section)
    const nameInput = page.getByPlaceholder('Add name...').first();
    await nameInput.fill('Charlie Test');
    await nameInput.press('Enter');

    // Person should appear in the participant list
    await expect(page.getByText('Charlie Test').first()).toBeVisible();
  });

  test('person added to activity appears in nucleus enrollment', async ({ page }) => {
    // Charlie was added in the previous test; they should now be enrolled in the nucleus
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    // Open the circles module so individual person nodes are visible
    await page.getByText('Overall Participation').click();
    await expect(page.locator('[aria-label="Charlie Test"]').first()).toBeVisible({ timeout: 15000 });
  });
});
