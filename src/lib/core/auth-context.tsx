/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { insforge } from './insforge';
import { logger } from '../services/logger';
import { recordTelemetry } from '../services/telemetry';
import { captureError } from '../services/sentry';
import { writeAuditLog, AuditActions, AuditEntityTypes } from '../services/audit.service';
import { connectAfterAuth } from '../services/realtime';
import { createMutex } from '../services/sync';
import type { AuthUser, UserProfile, AuthStatus } from '../../types';

const SESSION_DURATION = 24 * 60 * 60 * 1000;
const SESSION_START_KEY = 'highlands_session_start';
const ADMIN_ROLES: string[] = ['admin', 'manager'];
const REFRESH_ANOMALY_KEY = 'highlands_refresh_anomaly';
const REFRESH_ANOMALY_THRESHOLD = 5;
const RECONNECT_DEBOUNCE_MS = 2000;

interface AuthContextValue {
  user: AuthUser | null;
  authStatus: AuthStatus;
  loading: boolean;
  pendingEmail: string | null;
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; emailVerified?: boolean }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  verifyEmail: (otp: string) => Promise<{ error: Error | null }>;
  resendVerificationCode: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) {
    logger.warn('profile_fetch_failed', 'auth-context', {
      metadata: { userId, error: (error as Error)?.message },
    });
    return null;
  }
  return data as unknown as UserProfile;
}

function buildAuthUser(
  authUser: { id: string; email?: string; emailVerified?: boolean },
  profile: UserProfile | null,
): AuthUser {
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    role: profile?.role ?? 'staff',
    name: profile?.name ?? null,
    profile,
    emailVerified: authUser.emailVerified ?? false,
  };
}

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

function getRefreshAnomalyCount(): number {
  try {
    return Number(localStorage.getItem(REFRESH_ANOMALY_KEY)) || 0;
  } catch { return 0; }
}

function incrementRefreshAnomaly(): number {
  const count = getRefreshAnomalyCount() + 1;
  try { localStorage.setItem(REFRESH_ANOMALY_KEY, String(count)); } catch { /* noop */ }
  return count;
}

function resetRefreshAnomaly(): void {
  try { localStorage.removeItem(REFRESH_ANOMALY_KEY); } catch { /* noop */ }
}

const refreshMutex = createMutex();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('anonymous');
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastFocusRef = useRef(0);

  const isStaff = useCallback((role: string) => !ADMIN_ROLES.includes(role), []);

  const clearSessionTimer = useCallback(() => {
    try { localStorage.removeItem(SESSION_START_KEY); } catch { /* noop */ }
    setSessionExpired(false);
  }, []);

  const checkSessionExpiry = useCallback(() => {
    try {
      const started = localStorage.getItem(SESSION_START_KEY);
      if (!started) return false;
      const elapsed = Date.now() - Number(started);
      if (elapsed >= SESSION_DURATION) {
        setSessionExpired(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const expireStaffSession = useCallback(async () => {
    setSessionExpired(true);
    await insforge.auth.signOut();
    setUser(null);
    setAuthStatus('anonymous');
    setPendingEmail(null);
    try { localStorage.removeItem(SESSION_START_KEY); } catch { /* noop */ }
  }, []);

  const refreshSession = useCallback(async () => {
    const release = await refreshMutex.acquire();
    try {
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const { data, error } = await insforge.auth.refreshSession();
        if (!error && data) {
          resetRefreshAnomaly();
          recordTelemetry('auth_refresh', 'auth');
          return data as Record<string, unknown>;
        }
        const msg = (error as Error)?.message || 'unknown';
        const anomalyCount = incrementRefreshAnomaly();
        logger.warn('session_refresh_failed', 'auth-context', {
          metadata: { error: msg, anomalyCount, attempt: attempt + 1 },
        });
        recordTelemetry('auth_refresh_failed', 'auth', {
          error: msg,
          anomalyCount,
          attempt: attempt + 1,
        });
        if (anomalyCount >= REFRESH_ANOMALY_THRESHOLD) {
          captureError(new Error(`Auth refresh anomaly: ${anomalyCount} consecutive failures`), {
            anomalyCount,
            lastError: msg,
          });
        }
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
      return null;
    } catch (err) {
      incrementRefreshAnomaly();
      logger.error('session_refresh_caught', 'auth-context', {
        metadata: { error: (err as Error)?.message },
      });
      recordTelemetry('auth_refresh_failed', 'auth', { error: (err as Error)?.message });
      return null;
    } finally {
      release();
    }
  }, []);

  const recoverSession = useCallback(async () => {
    try {
      const { data, error } = await insforge.auth.getCurrentUser();
      if (error || !data?.user) return false;
      const profile = await fetchUserProfile(data.user.id);
      const built = buildAuthUser(data.user, profile);
      setUser(built);
      setAuthStatus(built.emailVerified ? 'authenticated' : 'verification_pending');
      recordTelemetry('auth_session_restored', 'auth', { userId: data.user.id });
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    insforge.auth.getCurrentUser().then(async ({ data, error }) => {
      if (cancelled) return;
      if (data?.user && !error) {
        const profile = await ensureProfile(data.user.id, data.user.email ?? '');
        const built = buildAuthUser(data.user, profile);
        if (!cancelled) {
          if (isStaff(built.role) && checkSessionExpiry()) {
            await insforge.auth.signOut();
            setUser(null);
            setAuthStatus('anonymous');
            setPendingEmail(null);
            try { localStorage.removeItem(SESSION_START_KEY); } catch { /* noop */ }
          } else {
            setUser(built);
            setAuthStatus(built.emailVerified ? 'authenticated' : 'verification_pending');
            if (!built.emailVerified) {
              setPendingEmail(built.email);
            }
            connectAfterAuth();
          }
        }
      }
      if (!cancelled) setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        logger.error('auth_hydration_failed', 'auth', { metadata: { error: (err as Error)?.message } });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [checkSessionExpiry, isStaff, ensureProfile]);

  // Cross-tab auth state sync via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SESSION_START_KEY && e.newValue === null && user) {
        logger.info('auth_session_expired_other_tab', 'auth', {
          metadata: { previousKey: e.key },
        });
        setUser(null);
        setAuthStatus('anonymous');
        setPendingEmail(null);
        setSessionExpired(true);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user]);

  // Reconnect-safe session recovery on focus
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusRef.current < RECONNECT_DEBOUNCE_MS) return;
      lastFocusRef.current = now;

      if (user && isStaff(user.role)) {
        refreshSession().then((session) => {
          if (!session) {
            expireStaffSession();
          } else {
            checkSessionExpiry();
          }
        });
      } else if (!user && !loading) {
        recoverSession();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, isStaff, expireStaffSession, checkSessionExpiry, refreshSession, recoverSession, loading]);

  const profileCache = useRef(new Map<string, UserProfile>());

  const ensureProfile = useCallback(async (userId: string, email: string, name?: string) => {
    const cached = profileCache.current.get(userId);
    if (cached) return cached;

    let profile = await fetchUserProfile(userId);
    if (!profile) {
      const { error } = await insforge.database.from('user_profiles').insert([{
        id: userId,
        name: name || null,
        email,
        role: 'staff',
        is_active: true,
      }]).maybeSingle();
      if (!error) {
        profile = { id: userId, name: name || null, email, role: 'staff', is_active: true, phone: null, avatar_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      } else {
        profile = await fetchUserProfile(userId);
      }
    }
    if (profile) profileCache.current.set(userId, profile);
    return profile;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) {
      if (isEmailNotVerified(error)) {
        setPendingEmail(email);
        setAuthStatus('verification_pending');
        return { error: null, emailVerified: false };
      }
      logger.error('sign_in_failed', 'auth-context', {
        metadata: { email, error: (error as Error)?.message },
      });
      recordTelemetry('auth_login', email, { success: false, error: (error as Error)?.message });
      return { error };
    }
    if (data?.user) {
      const profile = await ensureProfile(data.user.id, data.user.email ?? email, data.user.profile?.name);
      const built = buildAuthUser(data.user, profile);
      setUser(built);
      setSessionExpired(false);
      if (isStaff(built.role)) {
        try { localStorage.setItem(SESSION_START_KEY, String(Date.now())); } catch { /* noop */ }
      } else {
        clearSessionTimer();
      }
      if (!built.emailVerified) {
        setAuthStatus('verification_pending');
        setPendingEmail(built.email);
        recordTelemetry('auth_login', data.user.id, { success: true, emailVerified: false });
        return { error: null, emailVerified: false };
      }
      setAuthStatus('authenticated');
      setPendingEmail(null);
      resetRefreshAnomaly();
      connectAfterAuth();
      writeAuditLog({
        action: AuditActions.LOGIN,
        entity_type: AuditEntityTypes.USER,
        entity_id: data.user.id,
        metadata: { email: data.user.email, role: built.role },
      });
      recordTelemetry('auth_login', data.user.id, { success: true, emailVerified: true });
    }
    return { error: null, emailVerified: true };
  }, [ensureProfile, isStaff, clearSessionTimer]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      ...(name && { name }),
    });
    if (error) {
      if (isExistsUnverified(error)) {
        setPendingEmail(email);
        setAuthStatus('verification_pending');
        insforge.auth.resendVerificationEmail({ email }).catch(() => {});
        return { error: null };
      }
      logger.error('sign_up_failed', 'auth-context', {
        metadata: { email, name, error: (error as Error)?.message },
      });
      return { error };
    }
    if (data?.requireEmailVerification) {
      setPendingEmail(email);
      setAuthStatus('verification_pending');
      if (data?.user) {
        await ensureProfile(data.user.id, data.user.email ?? email, name).catch(() => {});
      }
    } else if (data?.user) {
      const profile = await ensureProfile(data.user.id, data.user.email ?? email, name);
      const built = buildAuthUser(data.user, profile);
      setUser(built);
      setAuthStatus('authenticated');
      setPendingEmail(null);
    }
    return { error: null };
  }, [ensureProfile]);

  const verifyEmail = useCallback(async (otp: string) => {
    if (!pendingEmail) return { error: new Error('No pending verification email') };
    try {
      const { data, error } = await insforge.auth.verifyEmail({
        email: pendingEmail,
        otp,
      });
      if (error) {
        logger.error('verify_email_failed', 'auth-context', {
          metadata: { email: pendingEmail, error: (error as Error)?.message },
        });
        return { error };
      }
      if (data?.user) {
        const profile = await ensureProfile(data.user.id, data.user.email ?? pendingEmail);
        const built = buildAuthUser(data.user, profile);
        setUser(built);
        setAuthStatus('authenticated');
        setPendingEmail(null);
        recordTelemetry('auth_login', data.user.id, { success: true, method: 'email_verification' });
      }
      return { error: null };
    } catch (err) {
      logger.error('verify_email_caught', 'auth-context', {
        metadata: { error: (err as Error)?.message },
      });
      return { error: err as Error };
    }
  }, [pendingEmail, ensureProfile]);

  const resendVerificationCode = useCallback(async () => {
    if (!pendingEmail) return { error: new Error('No pending verification email') };
    try {
      const { error } = await insforge.auth.resendVerificationEmail({
        email: pendingEmail,
      });
      if (error) {
        logger.error('resend_verification_failed', 'auth-context', {
          metadata: { email: pendingEmail, error: (error as Error)?.message },
        });
      }
      return { error };
    } catch (err) {
      return { error: err as Error };
    }
  }, [pendingEmail]);

  const signOut = useCallback(async () => {
    const currentUserId = user?.id;
    if (currentUserId) {
      writeAuditLog({
        action: AuditActions.LOGOUT,
        entity_type: AuditEntityTypes.USER,
        entity_id: currentUserId,
        metadata: { email: user?.email },
      });
      recordTelemetry('auth_logout', currentUserId, { email: user?.email });
    }
    try {
      await insforge.auth.signOut();
    } catch (err) {
      logger.error('sign_out_failed', 'auth-context', {
        metadata: { error: (err as Error)?.message },
      });
    }
    setUser(null);
    setAuthStatus('anonymous');
    setPendingEmail(null);
    clearSessionTimer();
  }, [clearSessionTimer, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        authStatus,
        loading,
        pendingEmail,
        sessionExpired,
        signIn,
        signUp,
        signOut,
        verifyEmail,
        resendVerificationCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
