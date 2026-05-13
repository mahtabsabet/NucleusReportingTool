import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { E2E_MAIN_USER_PASSWORD } from '../scripts/seed';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  if (!email) {
    throw new Error('Missing E2E_TEST_EMAIL in .env.local');
  }
  // Password lives in scripts/seed.ts so the seeded DB state and this
  // login attempt cannot drift apart. See the comment on
  // E2E_MAIN_USER_PASSWORD for the rationale.
  const password = E2E_MAIN_USER_PASSWORD;

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
