import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

const mockUseAuth = vi.fn();
vi.mock('../../lib/core/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderRoute(allowedRoles?: string[]) {
  return render(
    <MemoryRouter>
      <ProtectedRoute allowedRoles={allowedRoles as any}>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('should show spinner while loading', () => {
    mockUseAuth.mockReturnValue({ user: null, authStatus: 'idle', loading: true });
    renderRoute();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });

  it('should redirect to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, authStatus: 'idle', loading: false });
    renderRoute();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });

  it('should redirect to /verify-email when verification pending', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1', email: 'test@test.com', role: 'staff' }, authStatus: 'verification_pending', loading: false });
    renderRoute();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });

  it('should render children when authenticated without role restrictions', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1', email: 'test@test.com', role: 'staff' }, authStatus: 'authenticated', loading: false });
    renderRoute();
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  it('should render children when user role is in allowedRoles', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1', email: 'test@test.com', role: 'admin' }, authStatus: 'authenticated', loading: false });
    renderRoute(['admin', 'manager']);
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  it('should show 403 when user role is not in allowedRoles', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1', email: 'test@test.com', role: 'staff' }, authStatus: 'authenticated', loading: false });
    renderRoute(['admin']);
    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.getByText("You don't have permission to access this page.")).toBeTruthy();
  });
});
