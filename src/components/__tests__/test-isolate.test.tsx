import { describe, it, expect, vi } from 'vitest';
import ProtectedRoute from '../ProtectedRoute';

vi.mock('../../lib/core/auth-context', () => ({
  useAuth: () => ({ user: null, authStatus: 'idle', loading: false }),
}));

describe('ProtectedRoute', () => {
  it('exists', () => {
    expect(ProtectedRoute).toBeDefined();
  });
});
