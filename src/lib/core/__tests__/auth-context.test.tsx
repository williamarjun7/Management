import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

vi.mock('../../services/telemetry', () => ({
  recordTelemetry: vi.fn(),
  getCorrelationId: vi.fn(() => 'corr-id'),
}));

vi.mock('../../services/sentry', () => ({
  captureError: vi.fn(),
}));

vi.mock('../../services/audit.service', () => ({
  writeAuditLog: vi.fn(),
  AuditActions: { LOGIN: 'LOGIN', LOGOUT: 'LOGOUT' },
  AuditEntityTypes: { USER: 'user' },
}));

vi.mock('../../services/realtime', () => ({
  connectAfterAuth: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerificationEmail: vi.fn(),
  refreshSession: vi.fn(),
}));

const mockDb = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../insforge', () => ({
  insforge: { auth: mockAuth, database: mockDb },
}));

import { AuthProvider, useAuth } from '../auth-context';

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="auth-status">{auth.authStatus}</div>
      <div data-testid="user">{auth.user ? JSON.stringify(auth.user) : 'null'}</div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="pending-email">{auth.pendingEmail ?? 'null'}</div>
      <div data-testid="session-expired">{String(auth.sessionExpired)}</div>
      <button data-testid="btn-signin" onClick={() => auth.signIn('test@test.com', 'pass')}>Sign In</button>
      <button data-testid="btn-signup" onClick={() => auth.signUp('new@test.com', 'pass')}>Sign Up</button>
      <button data-testid="btn-verify" onClick={() => auth.verifyEmail('123456')}>Verify</button>
      <button data-testid="btn-resend" onClick={() => auth.resendVerificationCode()}>Resend</button>
      <button data-testid="btn-signout" onClick={() => auth.signOut()}>Sign Out</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </MemoryRouter>
  );
}

function mockProfileQuery(result: unknown = null) {
  mockDb.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: result, error: null })),
      })),
    })),
  });
}

const defaultProfile = {
  id: 'user-1', name: 'Test User', email: 'test@test.com',
  role: 'staff', phone: null, avatar_url: null, is_active: true,
  created_at: '2026-01-01', updated_at: '2026-01-01',
};

const defaultAuthUser = { id: 'user-1', email: 'test@test.com', emailVerified: true };

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockAuth.getCurrentUser.mockResolvedValue({ data: { user: null }, error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: null });
    mockAuth.signUp.mockResolvedValue({ data: null, error: null });
    mockAuth.signOut.mockResolvedValue({ error: null });
    mockAuth.verifyEmail.mockResolvedValue({ data: null, error: null });
    mockAuth.resendVerificationEmail.mockResolvedValue({ data: {}, error: null });
    mockProfileQuery(defaultProfile);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('shows loading then becomes anonymous when no session', async () => {
      renderProvider();
      expect(screen.getByTestId('loading').textContent).toBe('true');
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('auth-status').textContent).toBe('anonymous');
      expect(screen.getByTestId('user').textContent).toBe('null');
    });

    it('restores session when getCurrentUser returns a user', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      renderProvider();
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });
      const user = JSON.parse(screen.getByTestId('user').textContent!);
      expect(user.id).toBe('user-1');
      expect(user.email).toBe('test@test.com');
      expect(user.role).toBe('staff');
    });

    it('goes to verification_pending when session user email is not verified', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        data: { user: { ...defaultAuthUser, emailVerified: false } }, error: null,
      });
      renderProvider();
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('verification_pending');
      });
      expect(screen.getByTestId('pending-email').textContent).toBe('test@test.com');
    });

    it('sets loading false on hydration error', async () => {
      mockAuth.getCurrentUser.mockRejectedValue(new Error('Network error'));
      renderProvider();
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
    });
  });

  describe('signIn', () => {
    it('authenticates on successful signin with verified email', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signin').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });
    });

    it('returns emailVerified false for unverified accounts', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: null,
        error: Object.assign(new Error('Email not verified'), { statusCode: 403 }),
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signin').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('verification_pending');
      });
    });

    it('sets pendingEmail for unverified accounts', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: null,
        error: Object.assign(new Error('Email not verified'), { statusCode: 403 }),
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signin').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('pending-email').textContent).toBe('test@test.com');
      });
    });

    it('creates profile if missing after signin', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      mockDb.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn()
              .mockResolvedValueOnce({ data: null, error: null })
              .mockResolvedValueOnce({ data: defaultProfile, error: null }),
          })),
        })),
        insert: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ error: null }),
        })),
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signin').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });
    });
  });

  describe('signUp', () => {
    it('transitions to verification_pending when email verification required', async () => {
      mockAuth.signUp.mockResolvedValue({
        data: { requireEmailVerification: true }, error: null,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signup').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('pending-email').textContent).toBe('new@test.com');
      });
    });

    it('handles exists-unverified error and auto-resends', async () => {
      const existsError = Object.assign(new Error('User already exists'), { error: 'user_exists' });
      mockAuth.signUp.mockResolvedValue({ data: null, error: existsError });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signup').click(); });
      await waitFor(() => {
        expect(mockAuth.resendVerificationEmail).toHaveBeenCalled();
      });
    });
  });

  describe('verifyEmail', () => {
    it('authenticates on successful verification', async () => {
      mockAuth.verifyEmail.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      mockAuth.getCurrentUser.mockResolvedValue({
        data: { user: { ...defaultAuthUser, emailVerified: false } }, error: null,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-verify').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });
    });
  });

  describe('signOut', () => {
    it('resets state to anonymous', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
      await act(async () => { screen.getByTestId('btn-signin').click(); });
      await waitFor(() => expect(screen.getByTestId('auth-status').textContent).toBe('authenticated'));
      await act(async () => { screen.getByTestId('btn-signout').click(); });
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('anonymous');
        expect(screen.getByTestId('user').textContent).toBe('null');
      });
    });
  });

  describe('session expiry', () => {
    it('expires staff session after 24h', async () => {
      const SESSION_START_KEY = 'highlands_session_start';
      const past = Date.now() - 25 * 60 * 60 * 1000;
      localStorage.setItem(SESSION_START_KEY, String(past));
      mockAuth.getCurrentUser.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      mockAuth.signOut.mockResolvedValue({ error: null });
      renderProvider();
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('anonymous');
      });
    });
  });

  describe('cross-tab session sync', () => {
    it('logs out when session key is removed in another tab', async () => {
      const SESSION_START_KEY = 'highlands_session_start';
      localStorage.setItem(SESSION_START_KEY, String(Date.now()));
      mockAuth.getCurrentUser.mockResolvedValue({
        data: { user: defaultAuthUser }, error: null,
      });
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('auth-status').textContent).toBe('authenticated'));
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: SESSION_START_KEY, newValue: null, oldValue: String(Date.now()),
        }));
      });
      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('anonymous');
      });
    });
  });

  describe('useAuth hook', () => {
    it('throws when used outside AuthProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(
        <MemoryRouter>
          <TestConsumer />
        </MemoryRouter>
      )).toThrow('useAuth must be used within AuthProvider');
      consoleSpy.mockRestore();
    });
  });
});
