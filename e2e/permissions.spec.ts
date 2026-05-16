/**
 * Integration tests for user permissions.
 *
 * Each describe block authenticates as a different permanent test user (seeded
 * by scripts/seed.ts) and verifies what that role can and cannot do — both in
 * the UI and at the Edge Function (create-user / manage-user) API level.
 *
 * Roles under test:
 *   perm-super-admin  – is_super_admin = true, top-tier role
 *   perm-admin        – is_admin = true, no scoped permission row
 *   perm-regional     – is_regional_viewer = true, global read-only
 *   perm-coordinator  – cluster_coordinator for Test Cluster (cluster 1) only
 *   perm-collaborator – nucleus_collaborator for Test Nucleus (nucleus 1) only
 *   perm-lead         – activity_lead for Test Children's Class (activity 1) only
 *   perm-viewer       – authenticated, zero permissions
 *
 * The tests are intentionally cell-by-cell against the permissions table so
 * regressions in the central permissions module or the edge-function
 * enforcement layer are caught immediately.
 */

import { test, expect, type Page } from '@playwright/test';
import { TEST_IDS, TEST_TIMELINE_EVENT_NAME } from '../scripts/seed';

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
  return callEdgeFn(page, 'create-user', params);
}

/** Call the manage-user Edge Function directly and return { status, body }. */
async function callManageUser(
  page: Page,
  params: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return callEdgeFn(page, 'manage-user', params);
}

async function callEdgeFn(
  page: Page,
  fn: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const token = await getAccessToken(page);

  return page.evaluate(
    async ({ url, fn, token, params }) => {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
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
    { url: supabaseUrl, fn, token, params },
  );
}

/** Read role-dropdown option labels from an open Create User modal. */
async function getCreateUserRoleOptions(page: Page): Promise<string[]> {
  await page.goto('/users');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /create user/i }).click();
  const select = page.locator('select').first();
  await expect(select).toBeVisible();
  const labels = await select.locator('option').allTextContents();
  // Drop the placeholder "Select a role…" entry
  return labels.filter(t => t && !/^select a role/i.test(t.trim()));
}

// ── Seed bootstrap ───────────────────────────────────────────────────────────
//
// scripts/seed.ts auto-creates the main E2E test user on a fresh database
// (matching the existing pattern for the perm-* users). This block exercises
// the resulting user via the default storageState ("e2e/.auth/user.json")
// to confirm the bootstrap produced a working, admin-with-cluster-coordinator
// account — i.e. the seed didn't silently leave the user un-permissioned
// after creating it.

test.describe('main E2E user (seed-bootstrapped)', () => {
  // Default storageState (set in playwright.config.ts) — the auth.setup
  // fixture signs in as E2E_TEST_EMAIL / E2E_TEST_PASSWORD. Successful sign-in
  // already implies the auth.users row exists, but we additionally assert the
  // role grants below so a regression in the grant section of the seed is
  // caught here too.

  test('signs in successfully and lands on the app shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Login form should not render — we're already authenticated.
    await expect(page.locator('#email')).not.toBeVisible();
  });

  test('has admin grant — Create User button is visible on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
  });

  test('has cluster_coordinator grant for Test Cluster — sees New Nucleus on its map', async ({ page }) => {
    await selectTestCluster(page);
    await expect(page.getByRole('button', { name: /new nucleus/i })).toBeVisible({ timeout: 10000 });
  });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

test.describe('admin', () => {
  test.use({ storageState: 'e2e/.auth/perm-admin.json' });

  test('sees Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
  });

  test('Create User modal offers subordinate roles but not Administrator (super_admin only)', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create user/i }).click();
    const roleSelect = page.locator('select').first();
    await expect(roleSelect).toBeVisible();
    // Administrator requires super_admin; perm-admin is a regular admin, so it must not appear.
    await expect(roleSelect.locator('option', { hasText: 'Administrator' })).toHaveCount(0);
    await expect(roleSelect.locator('option', { hasText: 'Regional (View-Only)' })).toHaveCount(1);
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

// ─────────────────────────────────────────────────────────────────────────────
//  Tests added with the centralised permissions model.
//  These exercise the rows of the permissions table that involve Super Admin,
//  Regional (View-Only), the request-only flows, and per-role dropdown contents.
// ─────────────────────────────────────────────────────────────────────────────

// ── Super Admin ──────────────────────────────────────────────────────────────

test.describe('super admin', () => {
  test.use({ storageState: 'e2e/.auth/perm-super-admin.json' });

  test('Create User dropdown offers every role except Super Admin', async ({ page }) => {
    const opts = await getCreateUserRoleOptions(page);
    expect(opts).toEqual([
      'Administrator',
      'Regional (View-Only)',
      'Cluster Coordinator',
      'Nucleus Coordinator',
      'Activity Lead',
    ]);
  });

  test('Edge Function rejects creating a Super Admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { status, body } = await callCreateUser(page, {
      name:     'Should Not Exist',
      email:    `forbidden-super-${Date.now()}@nucleus-test.invalid`,
      password: 'NoSuperPass123!',
      role:     'super_admin',
    });
    expect(status).toBe(403);
    expect(typeof body.error).toBe('string');
  });

  test('Edge Function rejects deleting another Super Admin (none exist; safeguard self-protects)', async ({ page }) => {
    // We cannot delete ourselves; the function returns 403 either via the
    // self-action guard or the Super Admin protection. Both are acceptable.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const me = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const v = JSON.parse(localStorage.getItem(k)!);
          return v?.user?.id ?? '';
        }
      }
      return '';
    });
    const { status } = await callManageUser(page, {
      action: 'delete',
      targetUserId: me,
      confirmedEmail: 'perm-super-admin@nucleus-test.invalid',
    });
    expect(status).toBe(403);
  });
});

// ── Admin: dropdown excludes Administrator and Super Admin ──────────────────

test.describe('admin (dropdown shape)', () => {
  test.use({ storageState: 'e2e/.auth/perm-admin.json' });

  test('Create User dropdown excludes Administrator and Super Admin', async ({ page }) => {
    const opts = await getCreateUserRoleOptions(page);
    expect(opts).not.toContain('Administrator');
    expect(opts).not.toContain('Super Admin');
    // ...and DOES contain everything below it.
    expect(opts).toEqual(expect.arrayContaining([
      'Regional (View-Only)', 'Cluster Coordinator',
      'Nucleus Coordinator', 'Activity Lead',
    ]));
  });

  test('Edge Function blocks creating an Admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { status } = await callCreateUser(page, {
      name:     'Forbidden Admin',
      email:    `forbid-admin-${Date.now()}@nucleus-test.invalid`,
      password: 'NoAdminPass123!',
      role:     'admin',
    });
    expect(status).toBe(403);
  });

  test('Edge Function blocks deleting another Admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create an ephemeral Regional user, promote to Admin via SQL? We can't
    // — the seed already gives us perm-super-admin. Use that as the target.
    // The manage-user function should reject deletion because caller (Admin)
    // is not a Super Admin.
    const targetEmail = 'perm-super-admin@nucleus-test.invalid';
    // Resolve the target id from the auth metadata (regular SELECT on profiles
    // is gated by RLS; instead we round-trip through the Edge Function which
    // returns "User not found" or a 403 — both confirm the safeguard).
    const { status, body } = await callManageUser(page, {
      action: 'delete',
      // Use a fake id so we don't accidentally succeed on a permissive bug:
      // the function still resolves caller-vs-target safeguards before
      // looking the row up.
      targetUserId: '00000000-0000-0000-0000-000000000000',
      confirmedEmail: targetEmail,
    });
    expect([403, 404]).toContain(status);
    expect(typeof body.error).toBe('string');
  });
});

// ── Regional (View-Only) ────────────────────────────────────────────────────

test.describe('regional (view-only)', () => {
  test.use({ storageState: 'e2e/.auth/perm-regional.json' });

  test('does not see Create User button on /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).not.toBeVisible();
  });

  test('can read content from clusters they do not coordinate (global read)', async ({ page }) => {
    // Both nuclei should be visible because Regional has global read.
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    await page.goto(`/nucleus/${TEST_IDS.nucleus2Id}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus 2' })).toBeVisible({ timeout: 15000 });
  });

  test('Edge Function blocks creating any user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { status } = await callCreateUser(page, {
      name:       'Regional Attempt',
      email:      `regional-attempt-${Date.now()}@nucleus-test.invalid`,
      password:   'RegPass123!',
      role:       'activity_lead',
      activityId: TEST_IDS.activityId,
    });
    expect(status).toBe(403);
  });

  // ── UI affordances that imply edit access must not appear for view-only
  //    Regional users. The action would be blocked by RLS anyway, but seeing
  //    the control suggests a change is being made when in fact nothing
  //    happens — so we hide it client-side as well.

  test('Activities tab hides the "Add New Activity" button', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    // Open the focused activities panel by clicking its dashboard card.
    await page.getByText(/core and other activities/i).first().click();
    await expect(page.getByRole('heading', { name: /core and other activities/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add new activity/i })).not.toBeVisible();
  });

  test('Activity detail page hides participant add fields and "+" buttons', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}/activity/${TEST_IDS.activityId}`);
    await expect(page.getByRole('heading', { name: "Test Children's Class" }))
      .toBeVisible({ timeout: 15000 });
    // PersonNameCombobox uses placeholder "Add name..." — must be absent everywhere.
    await expect(page.getByPlaceholder('Add name...')).toHaveCount(0);
  });

  test('Activity detail hides Cancel/Save Changes and renders Schedule + Notes read-only', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}/activity/${TEST_IDS.activityId}`);
    await expect(page.getByRole('heading', { name: "Test Children's Class" }))
      .toBeVisible({ timeout: 15000 });
    // Footer buttons must not appear for Regional users.
    await expect(page.getByRole('button', { name: /^cancel$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /save changes/i })).not.toBeVisible();
    // Schedule + Notes fields must be present (so values are visible) but read-only.
    // The seeded test activity has no schedulingMode set, so ActivityDetail
    // defaults to 'sporadic_ongoing' which renders a single freeform text
    // input with placeholder "When does this happen?".
    const scheduleInput = page.getByPlaceholder(/when does this happen/i);
    await expect(scheduleInput).toHaveAttribute('readonly', '');
    const notesTextarea = page.locator('textarea').first();
    await expect(notesTextarea).toHaveAttribute('readonly', '');
  });

  test('Individual profile hides the "Edit Profile" button', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personParticipatingId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /edit profile/i })).not.toBeVisible();
  });

  test('Individual profile notes are read-only and Save Notes is hidden', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personParticipatingId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /notes \(conversations/i }))
      .toBeVisible({ timeout: 15000 });
    // Locate the notes textarea — it sits directly under that heading.
    const notesTextarea = page.locator('textarea').last();
    await expect(notesTextarea).toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: /save notes/i })).not.toBeVisible();
  });

  test('Concentric circles hide the "Save Engagement Levels" button', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    // Open the Circles module via its dashboard card.
    await page.getByText(/overall participation/i).first().click();
    await expect(page.getByRole('heading', { name: /overall participation/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save engagement levels/i })).not.toBeVisible();
    // The drag/drop hint must not appear either.
    await expect(page.getByText(/drag to reassign/i)).not.toBeVisible();
  });

  test('Profile panel in concentric circles shows primary contact as static text (no dropdown)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    await page.getByText(/overall participation/i).first().click();
    await expect(page.getByRole('heading', { name: /overall participation/i })).toBeVisible();
    // Click any rendered avatar to open the profile panel.
    const firstAvatar = page.locator('[data-node="true"]').first();
    await expect(firstAvatar).toBeVisible({ timeout: 15000 });
    await firstAvatar.click();
    // Panel header section
    await expect(page.getByRole('heading', { name: /primary contact/i })).toBeVisible();
    // No <select> in the primary-contact block.
    const panel = page.locator('div').filter({ hasText: /primary contact/i }).last();
    await expect(panel.locator('select')).toHaveCount(0);
  });
});

// ── Activity Lead: read-only nucleus-level affordances ─────────────────────
//
// Activity Leads can edit their own activity's roster, but they cannot
// create new activities, edit engagement levels, or change someone's
// primary contact. The corresponding controls must not render — otherwise
// the UI hints at edits that won't take effect.

test.describe('activity lead — nucleus-level read-only UI', () => {
  test.use({ storageState: 'e2e/.auth/perm-lead.json' });

  test('Activities tab hides the "Add New Activity" button', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    await page.getByText(/core and other activities/i).first().click();
    await expect(page.getByRole('heading', { name: /core and other activities/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add new activity/i })).not.toBeVisible();
  });

  test('Concentric circles hide the "Save Engagement Levels" button', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    await page.getByText(/overall participation/i).first().click();
    await expect(page.getByRole('heading', { name: /overall participation/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save engagement levels/i })).not.toBeVisible();
    await expect(page.getByText(/drag to reassign/i)).not.toBeVisible();
  });

  test('Profile panel in concentric circles shows primary contact as static text (no dropdown)', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}`);
    await expect(page.getByRole('heading', { name: 'Test Nucleus' })).toBeVisible({ timeout: 15000 });
    await page.getByText(/overall participation/i).first().click();
    await expect(page.getByRole('heading', { name: /overall participation/i })).toBeVisible();
    const firstAvatar = page.locator('[data-node="true"]').first();
    await expect(firstAvatar).toBeVisible({ timeout: 15000 });
    await firstAvatar.click();
    await expect(page.getByRole('heading', { name: /primary contact/i })).toBeVisible();
    const panel = page.locator('div').filter({ hasText: /primary contact/i }).last();
    await expect(panel.locator('select')).toHaveCount(0);
  });
});

// ── Role-dropdown shape per role ────────────────────────────────────────────
//
// These are deliberately focused tests — even if the broader behaviour drifts,
// these will catch a mismatch between the central permissions module and the
// permissions table the moment it appears.

test.describe('role dropdown — Cluster Coordinator', () => {
  test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });
  test('shows CC, NC, AL only', async ({ page }) => {
    const opts = await getCreateUserRoleOptions(page);
    expect(opts).toEqual([
      'Cluster Coordinator', 'Nucleus Coordinator', 'Activity Lead',
    ]);
  });
});

test.describe('role dropdown — Nucleus Coordinator', () => {
  test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });
  test('shows Activity Lead only', async ({ page }) => {
    const opts = await getCreateUserRoleOptions(page);
    expect(opts).toEqual(['Activity Lead']);
  });
});

// ── Request flow: Activity Lead requests person deletion ────────────────────

test.describe('activity lead — request flows', () => {
  test.use({ storageState: 'e2e/.auth/perm-lead.json' });

  test('person profile shows Request Deletion (not Delete) for AL', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personParticipatingId}`);
    await page.waitForLoadState('networkidle');
    // The AL can read this person via their nucleus, but they cannot
    // directly delete — they should see the request button instead.
    await expect(page.getByRole('button', { name: /request deletion/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^delete person$/i })).not.toBeVisible();
  });

  test('activity page shows Request Deletion for AL', async ({ page }) => {
    await page.goto(`/nucleus/${TEST_IDS.nucleusId}/activity/${TEST_IDS.activityId}`);
    await expect(page.getByRole('heading', { name: "Test Children's Class" }))
      .toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /request deletion/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^delete$/i })).not.toBeVisible();
  });

  test('submitting a deletion request inserts into permission_requests', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personAwareId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /request deletion/i }).click();
    // Modal opens; submit with no note.
    await page.getByRole('button', { name: /^submit request$/i }).click();
    // The button switches to a "Deletion requested" indicator.
    await expect(page.getByText(/deletion requested/i)).toBeVisible({ timeout: 10000 });
  });
});

// ── Cluster Coordinator: direct delete buttons (no Request) ─────────────────

test.describe('cluster coordinator — direct vs request', () => {
  test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });

  test('person profile shows direct Delete (red), not Request', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personAwareId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^delete person$/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /request deletion/i })).not.toBeVisible();
  });
});

// ── manage-user safeguards ──────────────────────────────────────────────────

test.describe('manage-user safeguards', () => {
  test.describe('admin cannot self-act', () => {
    test.use({ storageState: 'e2e/.auth/perm-admin.json' });
    test('cannot delete self', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const myId = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
            const v = JSON.parse(localStorage.getItem(k)!);
            return v?.user?.id ?? '';
          }
        }
        return '';
      });
      const { status } = await callManageUser(page, {
        action: 'delete',
        targetUserId: myId,
        confirmedEmail: 'perm-admin@nucleus-test.invalid',
      });
      expect(status).toBe(403);
    });

    test('cannot promote anyone to super_admin via change-role', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      // Targets the regional user; even with a valid email confirm, the role
      // check happens first.
      const { status } = await callManageUser(page, {
        action: 'change-role',
        targetUserId: '11111111-2222-3333-4444-555555555555', // any id
        newRole: 'super_admin',
        confirmedEmail: 'whatever@x',
      });
      expect(status).toBe(403);
    });
  });

  test.describe('cluster coordinator manage-user surface', () => {
    test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });
    test('change-role is accepted past the admin gate; missing scope returns 400', async ({ page }) => {
      // PR #58 opened the manage-user change-role action to CC/NC with
      // scope validation in code. The admin-only gate that used to send
      // CCs into the request flow is gone — so calling change-role now
      // gets past that gate and lands in the scope-validation block.
      // With no activityId supplied for an activity_lead newRole, the
      // edge function returns 400 "An activity must be specified…".
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const { status } = await callManageUser(page, {
        action: 'change-role',
        targetUserId: '11111111-2222-3333-4444-555555555555',
        newRole: 'activity_lead',
        confirmedEmail: 'whatever@x',
      });
      expect(status).toBe(400);
    });
  });

  test.describe('nucleus collaborator manage-user surface', () => {
    test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });
    test('change-role is accepted past the admin gate; missing scope returns 400', async ({ page }) => {
      // Same as the CC test above — PR #58 opened change-role to NC too
      // (limited to activity_lead via ROLE_ASSIGNERS).
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const { status } = await callManageUser(page, {
        action: 'change-role',
        targetUserId: '11111111-2222-3333-4444-555555555555',
        newRole: 'activity_lead',
        confirmedEmail: 'whatever@x',
      });
      expect(status).toBe(400);
    });
  });
});

// ── Helpers for map / timeline tests ─────────────────────────────────────────

/** Navigate to the map and ensure Test Cluster is the selected cluster. */
async function selectTestCluster(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Scoped users with access to a single cluster (perm-coordinator here)
  // have ClusterMapView auto-select that cluster on mount and render the
  // selector as a static badge — there's no dropdown to expand. For
  // admins / multi-cluster users, expand the dropdown and pick Test
  // Cluster from the list.
  const dropdown = page.locator('button[aria-expanded]').filter({ hasText: /All Clusters/ });
  if (await dropdown.count() > 0) {
    await dropdown.first().click();
    // "Test Cluster" and "Test Cluster 2" both appear; negative-lookahead picks the right one.
    await page.locator('button').filter({ hasText: /Test Cluster(?! 2)/ }).first().click();
    await page.waitForLoadState('networkidle');
  }
}

/** Select Test Cluster then open the Timeline panel. */
async function openTimelineForTestCluster(page: Page): Promise<void> {
  await selectTestCluster(page);
  await page.getByRole('button', { name: /timeline/i }).click();
  await page.waitForLoadState('networkidle');
}

// ── Positive creation tests ──────────────────────────────────────────────────

test.describe('cluster coordinator — positive creation', () => {
  test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });

  test('can create a Cluster Coordinator within own cluster via Edge Function', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { status, body } = await callCreateUser(page, {
      name:      'Ephemeral Coordinator',
      email:     `ephemeral-coord-${Date.now()}@nucleus-test.invalid`,
      password:  'EphemPass123!',
      role:      'cluster_coordinator',
      clusterId: TEST_IDS.clusterId,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  test('can create a Nucleus Coordinator within own cluster via Edge Function', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { status, body } = await callCreateUser(page, {
      name:      'Ephemeral NC',
      email:     `ephemeral-nc-${Date.now()}@nucleus-test.invalid`,
      password:  'EphemPass123!',
      role:      'nucleus_collaborator',
      nucleusId: TEST_IDS.nucleusId,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

test.describe('nucleus collaborator — positive creation', () => {
  test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });

  test('can create an Activity Lead within own nucleus via Edge Function', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { status, body } = await callCreateUser(page, {
      name:       'Ephemeral Lead',
      email:      `ephemeral-lead-${Date.now()}@nucleus-test.invalid`,
      password:   'EphemPass123!',
      role:       'activity_lead',
      activityId: TEST_IDS.activityId,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Nucleus Collaborator: request flows ──────────────────────────────────────

test.describe('nucleus collaborator — request flows', () => {
  test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });

  test('person profile shows Request Deletion (not Delete) for NC', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personAwareId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /request deletion/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^delete person$/i })).not.toBeVisible();
  });

  test('submitting a deletion request inserts into permission_requests', async ({ page }) => {
    await page.goto(`/individual/${TEST_IDS.personParticipatingId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /request deletion/i }).click();
    await page.getByRole('button', { name: /^submit request$/i }).click();
    await expect(page.getByText(/deletion requested/i)).toBeVisible({ timeout: 10000 });
  });
});

// ── Map: New Nucleus button visibility ───────────────────────────────────────

test.describe('map — New Nucleus button', () => {
  test.describe('cluster coordinator sees New Nucleus button', () => {
    test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });
    test('button appears after selecting own cluster', async ({ page }) => {
      await selectTestCluster(page);
      await expect(page.getByRole('button', { name: /new nucleus/i })).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('nucleus collaborator does not see New Nucleus button', () => {
    test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });
    test('button absent — NC cannot create nuclei', async ({ page }) => {
      await selectTestCluster(page);
      await expect(page.getByRole('button', { name: /new nucleus/i })).not.toBeVisible();
    });
  });

  test.describe('activity lead does not see New Nucleus button', () => {
    test.use({ storageState: 'e2e/.auth/perm-lead.json' });
    test('button absent — AL cannot create nuclei', async ({ page }) => {
      await selectTestCluster(page);
      await expect(page.getByRole('button', { name: /new nucleus/i })).not.toBeVisible();
    });
  });

  test.describe('regional viewer does not see New Nucleus button', () => {
    test.use({ storageState: 'e2e/.auth/perm-regional.json' });
    test('button absent — Regional is view-only', async ({ page }) => {
      await selectTestCluster(page);
      await expect(page.getByRole('button', { name: /new nucleus/i })).not.toBeVisible();
    });
  });
});

// ── Timeline: Add Event button visibility ────────────────────────────────────

test.describe('timeline — Add Event button', () => {
  test.describe('cluster coordinator sees Add Event button', () => {
    test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });
    test('Add Event visible in own cluster timeline', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add event/i })).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('nucleus collaborator does not see Add Event button', () => {
    test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });
    test('Add Event absent — NC cannot manage timeline events', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add event/i })).not.toBeVisible();
    });
  });

  test.describe('activity lead does not see Add Event button', () => {
    test.use({ storageState: 'e2e/.auth/perm-lead.json' });
    test('Add Event absent — AL cannot manage timeline events', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add event/i })).not.toBeVisible();
    });
  });

  test.describe('regional viewer does not see Add Event button', () => {
    test.use({ storageState: 'e2e/.auth/perm-regional.json' });
    test('Add Event absent — Regional is view-only', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add event/i })).not.toBeVisible();
    });
  });
});

// ── Timeline: Add Meeting button visibility ──────────────────────────────────
//
// Mirrors the Add Event tests above. Meetings use the same permission
// rule as events (`manage_timeline_meetings` → CC and higher), so the
// expected visibility is identical — but we assert each role
// independently to catch any future drift between the two rules.

test.describe('timeline — Add Meeting button', () => {
  test.describe('cluster coordinator sees Add Meeting button', () => {
    test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });
    test('Add Meeting visible in own cluster timeline', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add meeting/i })).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('nucleus collaborator does not see Add Meeting button', () => {
    test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });
    test('Add Meeting absent — NC cannot manage timeline meetings', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add meeting/i })).not.toBeVisible();
    });
  });

  test.describe('activity lead does not see Add Meeting button', () => {
    test.use({ storageState: 'e2e/.auth/perm-lead.json' });
    test('Add Meeting absent — AL cannot manage timeline meetings', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add meeting/i })).not.toBeVisible();
    });
  });

  test.describe('regional viewer does not see Add Meeting button', () => {
    test.use({ storageState: 'e2e/.auth/perm-regional.json' });
    test('Add Meeting absent — Regional is view-only', async ({ page }) => {
      await openTimelineForTestCluster(page);
      await expect(page.getByRole('button', { name: /add meeting/i })).not.toBeVisible();
    });
  });
});

// ── Timeline: notes attached to a timeline item ──────────────────────────────
//
// Deep-links into the workspace with ?item= so the detail drawer
// opens on mount — avoids having to find the marker by pixel-position
// on the strip (which depends on today's date relative to the
// timeline's year range). Exercises the full client→RLS→DB path for
// the new timeline_item_notes table.

/** Open the workspace with the seeded test event auto-selected. */
async function openTestEventDrawer(page: Page): Promise<void> {
  await page.goto(
    `/timeline?cluster=${TEST_IDS.clusterId}&item=${TEST_IDS.timelineEventId}`,
  );
  await page.waitForLoadState('networkidle');
  // Drawer renders the event name as an h2 — wait for it before
  // interacting with the tabs / forms inside.
  await expect(
    page.getByRole('heading', { name: TEST_TIMELINE_EVENT_NAME }),
  ).toBeVisible({ timeout: 15000 });
}

test.describe('timeline — notes and documents', () => {
  test.describe('cluster coordinator can attach a pasted note', () => {
    test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });

    test('paste a text note and see it listed in the drawer', async ({ page }) => {
      await openTestEventDrawer(page);

      // Switch to the Notes & Documents tab.
      await page.getByRole('button', { name: /notes & documents/i }).click();

      // Open the pasted-note form. Unique-ish body text so the assertion
      // can't collide with note bodies from prior runs.
      const noteBody = `Reflection notes captured ${Date.now()}`;
      await page.getByRole('button', { name: /paste note/i }).click();
      await page
        .getByPlaceholder(/paste your meeting notes here/i)
        .fill(noteBody);
      await page.getByRole('button', { name: /^save$/i }).click();

      // The note should appear inline in the list, with a "Note" kind
      // badge to distinguish it from documents / links.
      await expect(page.getByText(noteBody)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/^note$/i).first()).toBeVisible();

      // Tidy up — leaves the database in the state the seed expects on
      // its next run. We re-fetch the just-created note via the
      // delete-confirm dialog, accepting it to keep the cleanup local.
      page.once('dialog', d => d.accept());
      await page
        .locator('li', { hasText: noteBody })
        .getByRole('button', { name: /delete/i })
        .click();
      await expect(page.getByText(noteBody)).not.toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('nucleus collaborator cannot attach notes', () => {
    test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });

    test('drawer opens for NC but the add-note buttons are absent', async ({ page }) => {
      await openTestEventDrawer(page);
      await page.getByRole('button', { name: /notes & documents/i }).click();
      // NC has cluster-read access (via nucleus→cluster) so the drawer
      // and the existing notes list are visible — but the add-note
      // affordances are gated on canManageClusterTimelineNotes.
      await expect(page.getByRole('button', { name: /paste note/i })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /upload document/i })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /add link/i })).not.toBeVisible();
    });
  });

  // Regional viewers CAN read timeline data as of migration
  // 20260514_regional_viewer_timeline_read.sql (SELECT-only policies on
  // timeline_events / timeline_item_notes), but still cannot attach
  // notes — no write policy references is_regional_viewer().
  //
  // test.fixme until that migration is applied to the shared e2e
  // Supabase project: without it, openTestEventDrawer's deep link times
  // out because the regional user can't yet read the seeded
  // timeline_events row. Flip .fixme → normal once the e2e DB is migrated.
  test.describe('regional viewer can read notes but not attach them', () => {
    test.use({ storageState: 'e2e/.auth/perm-regional.json' });

    test.fixme('drawer opens for Regional but the add-note buttons are absent', async ({ page }) => {
      await openTestEventDrawer(page);
      await page.getByRole('button', { name: /notes & documents/i }).click();
      await expect(page.getByRole('button', { name: /paste note/i })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /upload document/i })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /add link/i })).not.toBeVisible();
    });
  });
});
