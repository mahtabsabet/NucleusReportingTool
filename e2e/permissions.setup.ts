import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_USERS } from '../scripts/seed';

// Authenticate each permanent permission test user and save their session to disk.
// These sessions are consumed by permissions.spec.ts via test.use({ storageState }).

const PERM_USERS: Array<{ key: keyof typeof TEST_USERS; file: string }> = [
  { key: 'superAdmin',  file: 'e2e/.auth/perm-super-admin.json' },
  { key: 'admin',       file: 'e2e/.auth/perm-admin.json' },
  { key: 'regional',    file: 'e2e/.auth/perm-regional.json' },
  { key: 'coordinator', file: 'e2e/.auth/perm-coordinator.json' },
  { key: 'collaborator',file: 'e2e/.auth/perm-collaborator.json' },
  { key: 'lead',        file: 'e2e/.auth/perm-lead.json' },
  { key: 'viewer',      file: 'e2e/.auth/perm-viewer.json' },
];

for (const { key, file } of PERM_USERS) {
  setup(`authenticate as perm-${key}`, async ({ page }) => {
    const { email, password } = TEST_USERS[key];

    await page.goto('/');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('#email')).not.toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.context().storageState({ path: file });
  });
}
