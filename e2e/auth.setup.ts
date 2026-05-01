import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD in .env.local');
  }

  await page.goto('/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for the login form to disappear and the page to fully settle
  // so Supabase has written the session token to localStorage before we save state
  await expect(page.locator('#email')).not.toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('networkidle');

  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.context().storageState({ path: authFile });
});
