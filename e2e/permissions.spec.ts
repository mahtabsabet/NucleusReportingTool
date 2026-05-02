/**
 * Integration tests for user permissions.
 *
 * Each describe block authenticates as a different permanent test user (seeded
 * by scripts/seed.ts) and verifies what that role can and cannot do — both in
 * the UI and at the Edge Function (create-user) API level.
 *
 * Roles under test:
 *   perm-admin        – is_admin = true, no scoped permission row
 *   perm-coordinator  – cluster_coordinator for Test Cluster (cluster 1) only
 *   perm-collaborator – nucleus_collaborator for Test Nucleus (nucleus 1) only
 *   perm-lead         – activity_lead for Test Children's Class (activity 1) only
 *   perm-viewer       – authenticated, zero permissions
 */

import { test, expect, type Page } from '@playwright/test';
import { TEST_IDS } from '../scripts/seed';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract the Supabase JWT from localStorage (set by the storageState fixture). */
async function getAccessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = JSON.parse(localStorage.getItem(key)!);
        return (val?.access_token as string) ?? '';
      }
    }
    return '';
  });
}

/** Call the create-user Edge Function directly and return { status, body }. */
async function callCreateUser(
  page: Page,
  params: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const token = await getAccessToken(page);

  // Use the browser's fetch so the call goes through the same network path
  const result = await page.evaluate(
    async ({ url, token, params }) => {
      const res = await fetch(`${url}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      const body = await res.json();
      return { status: res.status, body };
    },
    { url: supabaseUrl, token, params },
  );
  return result;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

test.describe('admin', () => {
  test.use({ storageState: 'e2e/.auth/perm-admin.json' });

  test('sees Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
  });

  test('Create User modal offers all roles including Administrator', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create user/i }).click();
    const roleSelect = page.locator('select').first();
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect.locator('option', { hasText: 'Administrator' })).toHaveCount(1);
    await expect(roleSelect.locator('option', { hasText: 'Cluster Coordinator' })).toHaveCount(1);
    await expect(roleSelect.locator('option', { hasText: 'Nucleus Coordinator' })).toHaveCount(1);
    await expect(roleSelect.locator('option', { hasText: 'Activity Lead' })).toHaveCount(1);
  });

  test('can navigate to nucleus 1 and see its content', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
  });

  test('can navigate to nucleus 2 (different cluster) and see its content', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleus2Id}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus 2' })).toBeVisible({ timeout: 15000 });
  });

  test('can create a nucleus collaborator via the Edge Function', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:      'Ephemeral Collaborator',
      email:     `ephemeral-collab-${Date.now()}@nucleus-test.invalid`,
      password:  'EphemPass123!',
      role:      'nucleus_collaborator',
      nucleusId: TEST_IDS.nucleusId,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.userId).toBe('string');
  });
});

// ── Cluster Coordinator ───────────────────────────────────────────────────────

test.describe('cluster coordinator', () => {
  test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });

  test('sees Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
  });

  test('Create User modal does not offer Administrator role', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create user/i }).click();
    const roleSelect = page.locator('select').first();
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect.locator('option', { hasText: 'Administrator' })).toHaveCount(0);
    // Can still create subordinate roles
    await expect(roleSelect.locator('option', { hasText: 'Cluster Coordinator' })).toHaveCount(1);
    await expect(roleSelect.locator('option', { hasText: 'Activity Lead' })).toHaveCount(1);
  });

  test('can navigate to nucleus 1 (in their cluster)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
  });

  test('cannot see nucleus 2 content (different cluster — out of scope)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleus2Id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Test Nucleus 2' })).not.toBeVisible();
  });

  test('Edge Function blocks creating an admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:     'Rogue Admin',
      email:    `rogue-admin@nucleus-test.invalid`,
      password: 'RoguePass123!',
      role:     'admin',
    });

    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });

  test('Edge Function blocks creating a coordinator for a different cluster', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:      'Out-of-scope Coordinator',
      email:     `oos-coord@nucleus-test.invalid`,
      password:  'OosPass123!',
      role:      'cluster_coordinator',
      clusterId: TEST_IDS.cluster2Id,
    });

    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });
});

// ── Nucleus Collaborator ──────────────────────────────────────────────────────

test.describe('nucleus collaborator', () => {
  test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });

  test('sees Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
  });

  test('Create User modal only offers Activity Lead role', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create user/i }).click();
    const roleSelect = page.locator('select').first();
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect.locator('option', { hasText: 'Administrator' })).toHaveCount(0);
    await expect(roleSelect.locator('option', { hasText: 'Cluster Coordinator' })).toHaveCount(0);
    await expect(roleSelect.locator('option', { hasText: 'Nucleus Coordinator' })).toHaveCount(0);
    await expect(roleSelect.locator('option', { hasText: 'Activity Lead' })).toHaveCount(1);
  });

  test('can navigate to nucleus 1 (their nucleus)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
  });

  test('cannot see nucleus 2 content (different cluster — out of scope)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleus2Id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Test Nucleus 2' })).not.toBeVisible();
  });

  test('Edge Function blocks creating a nucleus collaborator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:      'Escalated Collaborator',
      email:     `escalated-collab@nucleus-test.invalid`,
      password:  'EscPass123!',
      role:      'nucleus_collaborator',
      nucleusId: TEST_IDS.nucleusId,
    });

    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });

  test('Edge Function blocks creating a cluster coordinator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:      'Escalated Coordinator',
      email:     `escalated-coord@nucleus-test.invalid`,
      password:  'EscPass123!',
      role:      'cluster_coordinator',
      clusterId: TEST_IDS.clusterId,
    });

    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });
});

// ── Activity Lead ─────────────────────────────────────────────────────────────

test.describe('activity lead', () => {
  test.use({ storageState: 'e2e/.auth/perm-lead.json' });

  test('does not see Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).not.toBeVisible();
  });

  test('can navigate to their activity page', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}/activity/${TEST_IDS.activityId}`);
    await expect(page.getByRole('heading', { name: "Test Children's Class" })).toBeVisible({ timeout: 15000 });
  });

  test('can see nucleus 1 (RLS cascades from activity to its parent nucleus)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
  });

  test('cannot see nucleus 2 content (unrelated nucleus)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleus2Id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Test Nucleus 2' })).not.toBeVisible();
  });

  test('Edge Function blocks creating any user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:       'Disallowed User',
      email:      `disallowed@nucleus-test.invalid`,
      password:   'DisPass123!',
      role:       'activity_lead',
      activityId: TEST_IDS.activityId,
    });

    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });
});

// ── Viewer (no permissions) ───────────────────────────────────────────────────

test.describe('viewer (no permissions)', () => {
  test.use({ storageState: 'e2e/.auth/perm-viewer.json' });

  test('does not see Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).not.toBeVisible();
  });

  test('cannot see nucleus 1 content (no access at all)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).not.toBeVisible();
  });

  test('cannot see nucleus 2 content (no access at all)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleus2Id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Test Nucleus 2' })).not.toBeVisible();
  });

  test('Edge Function blocks creating any user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { status, body } = await callCreateUser(page, {
      name:       'Viewer Attempt',
      email:      `viewer-attempt@nucleus-test.invalid`,
      password:   'ViewPass123!',
      role:       'activity_lead',
      activityId: TEST_IDS.activityId,
    });

    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });
});
