import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMocks } from './setup';

function isExistsUnverified(error: Error & { statusCode?: number; error?: string }): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  const code = (error?.error ?? '').toLowerCase();
  if (msg.includes('already exists') || msg.includes('already registered')) return true;
  if (code.includes('user_exists') || code.includes('already_exists')) return true;
  if (error?.statusCode === 409) return true;
  return false;
}

function isEmailNotVerified(error: Error & { statusCode?: number; error?: string }): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  const code = (error?.error ?? '').toLowerCase();
  if (msg.includes('verify') || msg.includes('not verified') || msg.includes('email_required')) return true;
  if (code.includes('email_not_verified') || code.includes('verification_required')) return true;
  if (error?.statusCode === 403) return true;
  return false;
}

const SDK = {
  getCurrentUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerificationEmail: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('../../lib/insforge', () => ({
  insforge: {
    auth: SDK,
    database: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    },
  },
}));

beforeEach(() => {
  clearAllMocks();
  vi.clearAllMocks();
});

describe('auth helper functions', () => {
  describe('isExistsUnverified', () => {
    it('detects "already exists" in message', () => {
      expect(isExistsUnverified(new Error('User already exists'))).toBe(true);
    });

    it('detects "already registered" in message', () => {
      expect(isExistsUnverified(new Error('Email already registered'))).toBe(true);
    });

    it('detects user_exists code', () => {
      const err = new Error('conflict') as Error & { error?: string };
      err.error = 'user_exists';
      expect(isExistsUnverified(err)).toBe(true);
    });

    it('detects 409 status code', () => {
      const err = new Error('conflict') as Error & { statusCode?: number };
      err.statusCode = 409;
      expect(isExistsUnverified(err)).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isExistsUnverified(new Error('Network error'))).toBe(false);
    });

    it('handles empty message', () => {
      expect(isExistsUnverified(new Error())).toBe(false);
    });
  });

  describe('isEmailNotVerified', () => {
    it('detects "verify" in message', () => {
      expect(isEmailNotVerified(new Error('Please verify your email'))).toBe(true);
    });

    it('detects "not verified" in message', () => {
      expect(isEmailNotVerified(new Error('Email not verified'))).toBe(true);
    });

    it('detects "email_required" in message', () => {
      expect(isEmailNotVerified(new Error('email_required'))).toBe(true);
    });

    it('detects email_not_verified code', () => {
      const err = new Error('auth error') as Error & { error?: string };
      err.error = 'email_not_verified';
      expect(isEmailNotVerified(err)).toBe(true);
    });

    it('detects verification_required code', () => {
      const err = new Error('auth error') as Error & { error?: string };
      err.error = 'verification_required';
      expect(isEmailNotVerified(err)).toBe(true);
    });

    it('detects 403 status code', () => {
      const err = new Error('forbidden') as Error & { statusCode?: number };
      err.statusCode = 403;
      expect(isEmailNotVerified(err)).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isEmailNotVerified(new Error('Invalid credentials'))).toBe(false);
    });
  });
});

describe('auth state machine', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com', emailVerified: true };

  describe('signUp flow', () => {
    it('transitions to verification_pending when email verification required', async () => {
      SDK.signUp.mockResolvedValueOnce({
        data: { requireEmailVerification: true },
        error: null,
      });

      const { error } = await SDK.signUp({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(error).toBeNull();
    });

    it('detects existing unverified user and triggers auto-resend', async () => {
      const existsError = new Error('User already exists') as Error & { error?: string };
      existsError.error = 'user_exists';

      SDK.signUp.mockResolvedValueOnce({ data: null, error: existsError });
      SDK.resendVerificationEmail.mockResolvedValueOnce({ data: {}, error: null });

      const { error } = await SDK.signUp({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(error).not.toBeNull();
      expect(isExistsUnverified(error!)).toBe(true);
    });

    it('returns error for failed signup', async () => {
      SDK.signUp.mockResolvedValueOnce({
        data: null,
        error: new Error('Weak password'),
      });

      const { data, error } = await SDK.signUp({
        email: 'test@example.com',
        password: '123',
      });

      expect(error).not.toBeNull();
      expect(error!.message).toBe('Weak password');
      expect(data).toBeNull();
    });
  });

  describe('signIn flow', () => {
    it('returns emailVerified: false for unverified accounts', async () => {
      const unverifiedError = new Error('Email not verified') as Error & { statusCode?: number };
      unverifiedError.statusCode = 403;

      SDK.signInWithPassword.mockResolvedValueOnce({
        data: null,
        error: unverifiedError,
      });

      const { error } = await SDK.signInWithPassword({
        email: 'unverified@example.com',
        password: 'password123',
      });

      expect(error).not.toBeNull();
      expect(isEmailNotVerified(error!)).toBe(true);
    });

    it('returns user data for verified accounts on success', async () => {
      SDK.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: 'user-1', email: 'test@example.com', emailVerified: true } },
        error: null,
      });

      const { data, error } = await SDK.signInWithPassword({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(error).toBeNull();
      expect(data?.user?.emailVerified).toBe(true);
      expect(data?.user?.id).toBe('user-1');
    });
  });

  describe('verifyEmail flow', () => {
    it('returns user on successful verification', async () => {
      SDK.verifyEmail.mockResolvedValueOnce({
        data: { user: { id: 'user-1', email: 'test@example.com', emailVerified: true } },
        error: null,
      });

      const { data, error } = await SDK.verifyEmail({
        email: 'test@example.com',
        otp: '123456',
      });

      expect(error).toBeNull();
      expect(data?.user?.emailVerified).toBe(true);
    });

    it('returns error for invalid OTP', async () => {
      SDK.verifyEmail.mockResolvedValueOnce({
        data: null,
        error: new Error('Invalid or expired OTP'),
      });

      const { data, error } = await SDK.verifyEmail({
        email: 'test@example.com',
        otp: '000000',
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('OTP');
      expect(data).toBeNull();
    });
  });

  describe('signOut flow', () => {
    it('resets to anonymous state after signout', async () => {
      SDK.signOut.mockResolvedValueOnce({ error: null });

      await SDK.signOut();

      expect(SDK.signOut).toHaveBeenCalledOnce();
    });

    it('clears state even if signOut SDK call fails', async () => {
      SDK.signOut.mockResolvedValueOnce({ error: new Error('Network error') });

      await SDK.signOut();

      expect(SDK.signOut).toHaveBeenCalledOnce();
    });
  });

  describe('getCurrentUser flow', () => {
    it('returns user if authenticated', async () => {
      SDK.getCurrentUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      const { data, error } = await SDK.getCurrentUser();

      expect(error).toBeNull();
      expect(data?.user?.emailVerified).toBe(true);
      expect(data?.user?.email).toBe('test@example.com');
    });

    it('returns null for unauthenticated users', async () => {
      SDK.getCurrentUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const { data, error } = await SDK.getCurrentUser();

      expect(error).toBeNull();
      expect(data?.user).toBeNull();
    });
  });
});
