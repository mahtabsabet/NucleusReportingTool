import { describe, it, expect, vi, beforeEach } from 'vitest';

// The privacy module reads `supabase` from '../../supabase' at import time.
// Stub it before importing so the helpers can be exercised without a
// real Supabase connection.
const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            single: () => mockMaybeSingle(),
          }),
        }),
        insert: (row: any) => mockInsert(row),
        update: (patch: any) => ({
          eq: (_col: string, _val: string) => mockUpdate(patch),
        }),
      }),
      rpc: (fn: string, args: any) => mockRpc(fn, args),
    },
  };
});

import {
  CURRENT_PRIVACY_POLICY_VERSION,
  fetchPrivacyAckStatus,
  recordPrivacyAcknowledgement,
  adminResetPrivacyAcknowledgement,
} from '../privacy';

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockRpc.mockReset();
  mockInsert.mockResolvedValue({ error: null });
  mockUpdate.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: null });
});

describe('CURRENT_PRIVACY_POLICY_VERSION', () => {
  it('is a non-empty string so the gate can use it as an identity', () => {
    expect(typeof CURRENT_PRIVACY_POLICY_VERSION).toBe('string');
    expect(CURRENT_PRIVACY_POLICY_VERSION.length).toBeGreaterThan(0);
  });
});

describe('fetchPrivacyAckStatus', () => {
  it('treats a matching stored version as acknowledged', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        privacy_acknowledged_at: '2026-05-01T00:00:00Z',
        privacy_policy_version_acknowledged: CURRENT_PRIVACY_POLICY_VERSION,
      },
      error: null,
    });
    const status = await fetchPrivacyAckStatus('user-1');
    expect(status.acknowledged).toBe(true);
    expect(status.version).toBe(CURRENT_PRIVACY_POLICY_VERSION);
  });

  it('treats a stored older version as not acknowledged (re-prompt on version bump)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        privacy_acknowledged_at: '2025-01-01T00:00:00Z',
        privacy_policy_version_acknowledged: '2025-01-01',
      },
      error: null,
    });
    const status = await fetchPrivacyAckStatus('user-1');
    expect(status.acknowledged).toBe(false);
    expect(status.version).toBe('2025-01-01');
  });

  it('treats a null stored version as not acknowledged (brand new user)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        privacy_acknowledged_at: null,
        privacy_policy_version_acknowledged: null,
      },
      error: null,
    });
    const status = await fetchPrivacyAckStatus('user-1');
    expect(status.acknowledged).toBe(false);
    expect(status.version).toBeNull();
    expect(status.acknowledgedAt).toBeNull();
  });
});

describe('recordPrivacyAcknowledgement', () => {
  it('writes the audit log row and updates the profile to the current version', async () => {
    await recordPrivacyAcknowledgement('user-1');

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const inserted = mockInsert.mock.calls[0][0];
    expect(inserted.user_id).toBe('user-1');
    expect(inserted.policy_version).toBe(CURRENT_PRIVACY_POLICY_VERSION);
    expect(typeof inserted.acknowledged_at).toBe('string');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.privacy_policy_version_acknowledged).toBe(CURRENT_PRIVACY_POLICY_VERSION);
    expect(typeof patch.privacy_acknowledged_at).toBe('string');
  });

  it('aborts before updating the profile if the audit log write fails', async () => {
    mockInsert.mockResolvedValue({ error: new Error('rls denied') });
    await expect(recordPrivacyAcknowledgement('user-1')).rejects.toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('adminResetPrivacyAcknowledgement', () => {
  it('calls the reset_privacy_acknowledgement RPC with the target user', async () => {
    await adminResetPrivacyAcknowledgement('user-7');
    expect(mockRpc).toHaveBeenCalledWith('reset_privacy_acknowledgement', {
      target_user_id: 'user-7',
    });
  });
});
