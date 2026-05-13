import { describe, it, expect } from 'vitest';
import { PASSWORD_MIN_LENGTH, passwordStrengthLabel } from '../../components/ChangePasswordModal';

// Unit tests for the password-policy helpers used by:
//   - ChangePasswordModal       (self-service change)
//   - ResetPasswordPage          (forgot-password completion)
//   - CreateUserModal            (temporary-password create)
//   - ResetPasswordModal         (admin reset → temporary mode)
//
// The same minimum length is enforced server-side in the manage-user and
// create-user edge functions (kept in sync manually — see the comments
// there). These tests exist to lock the threshold in one place and to
// document the strength tiers the UI surfaces.

describe('PASSWORD_MIN_LENGTH', () => {
  it('is the documented 8 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('passwordStrengthLabel', () => {
  it('flags anything below the minimum as "Too short"', () => {
    expect(passwordStrengthLabel('').label).toBe('Too short');
    expect(passwordStrengthLabel('abc').label).toBe('Too short');
    expect(passwordStrengthLabel('a'.repeat(PASSWORD_MIN_LENGTH - 1)).label).toBe('Too short');
  });

  it('long but single-class passwords are Weak', () => {
    expect(passwordStrengthLabel('alllowercase').label).toBe('Weak');
    expect(passwordStrengthLabel('11111111').label).toBe('Weak');
  });

  it('mixed case + digits is at least Okay', () => {
    expect(passwordStrengthLabel('Abcdefg1').label).toBe('Okay');
  });

  it('mixed case + digit + symbol is Strong', () => {
    expect(passwordStrengthLabel('Abcdefg1!').label).toBe('Strong');
    expect(passwordStrengthLabel('Pa55w0rd!').label).toBe('Strong');
  });

  it('produces a numeric score that increases with character classes', () => {
    const a = passwordStrengthLabel('alllowercase').score;
    const b = passwordStrengthLabel('Abcdefgh').score;     // mixed case
    const c = passwordStrengthLabel('Abcdefg1').score;     // + digit
    const d = passwordStrengthLabel('Abcdefg1!').score;    // + symbol
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    expect(c).toBeLessThanOrEqual(d);
    expect(d).toBe(3);
  });
});
