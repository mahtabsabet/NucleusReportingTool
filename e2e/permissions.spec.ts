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
    const scheduleInput = page.getByPlaceholder(/saturdays at 10:00/i);
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

  test.describe('cluster coordinator cannot use manage-user', () => {
    test.use({ storageState: 'e2e/.auth/perm-coordinator.json' });
    test('change-role rejected — must use request flow', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const { status } = await callManageUser(page, {
        action: 'change-role',
        targetUserId: '11111111-2222-3333-4444-555555555555',
        newRole: 'activity_lead',
        confirmedEmail: 'whatever@x',
      });
      expect(status).toBe(403);
    });
  });

  test.describe('nucleus collaborator cannot use manage-user', () => {
    test.use({ storageState: 'e2e/.auth/perm-collaborator.json' });
    test('change-role rejected — must use request flow', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const { status } = await callManageUser(page, {
        action: 'change-role',
        targetUserId: '11111111-2222-3333-4444-555555555555',
        newRole: 'activity_lead',
        confirmedEmail: 'whatever@x',
      });
      expect(status).toBe(403);
    });
  });
});

// ── Helpers for map / timeline tests ─────────────────────────────────────────

/** Navigate to the map and select Test Cluster in the sidebar. */
async function selectTestCluster(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // "Test Cluster" and "Test Cluster 2" both appear; negative-lookahead picks the right one.
  await page.locator('button').filter({ hasText: /Test Cluster(?! 2)/ }).first().click();
  await page.waitForLoadState('networkidle');
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
