import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockSignOut = vi.fn();
const mockToggleTheme = vi.fn();
const mockRefetchAllQueries = vi.fn();
const mockToast = vi.fn();
const mockSyncAllTables = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../lib/core/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../lib/core/theme-context', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: mockToggleTheme }),
}));

vi.mock('../OfflineBanner', () => ({
  useConnectionState: () => ({ state: 'connected', lastSynced: new Date() }),
  OfflineBanner: () => null,
}));

vi.mock('../../lib/hooks/useKeyboardAware', () => ({
  useKeyboardAware: () => ({ keyboardHeight: 0, isKeyboardOpen: false }),
}));

vi.mock('../../lib/services/table-occupancy', () => ({
  syncAllTables: () => mockSyncAllTables(),
}));

vi.mock('../../lib/core/query-client', () => ({
  refetchAllQueries: () => mockRefetchAllQueries(),
}));

vi.mock('../ui/toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('../ui/bottom-sheet', () => ({
  BottomSheet: ({ open, onClose, title, children }: any) =>
    open ? (
      <div data-testid="bottom-sheet">
        <div data-testid="bottom-sheet-title">{title}</div>
        {children}
        <button data-testid="bottom-sheet-close" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock('../PageTransition', () => ({
  PageTransition: ({ children }: any) => <>{children}</>,
}));

vi.mock('../QueueStatusBadge', () => ({
  QueueStatusBadge: () => <div data-testid="queue-status-badge" />,
}));

vi.mock('../../assets/logo.png', () => ({ default: 'logo.png' }));

import Layout from '../Layout';

function renderLayout(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="dashboard" element={<div>Dashboard page</div>} />
          <Route path="pos" element={<div>POS page</div>} />
          <Route path="orders" element={<div>Orders page</div>} />
          <Route path="*" element={<div>Other page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin' },
      authStatus: 'authenticated', loading: false, signOut: mockSignOut,
    });
  });

  it('renders logo and app name', () => {
    renderLayout();
    expect(screen.getByText("Highlands Cafe & Motel Inn")).toBeTruthy();
    expect(screen.getByAltText("Highlands Cafe & Motel Inn")).toBeTruthy();
  });

  it('shows user name and role', () => {
    renderLayout();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('shows avatar with first letter of name', () => {
    renderLayout();
    expect(screen.getByText('A')).toBeTruthy();
  });

  function sidebar() {
    return within(document.querySelector('aside')!);
  }

  it('shows all nav items for admin role in sidebar', () => {
    renderLayout();
    expect(sidebar().getByText('Dashboard')).toBeTruthy();
    expect(sidebar().getByText('POS')).toBeTruthy();
    expect(sidebar().getByText('Orders')).toBeTruthy();
    expect(sidebar().getByText('Kitchen')).toBeTruthy();
    expect(sidebar().getByText('Menu')).toBeTruthy();
    expect(sidebar().getByText('Settings')).toBeTruthy();
    expect(sidebar().getByText('Audit Log')).toBeTruthy();
  });

  it('filters sidebar nav items for kitchen role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '2', email: 'kitchen@test.com', name: 'Chef', role: 'kitchen' },
      authStatus: 'authenticated', loading: false, signOut: mockSignOut,
    });
    renderLayout();
    expect(sidebar().getByText('Dashboard')).toBeTruthy();
    expect(sidebar().getByText('Kitchen')).toBeTruthy();
    expect(sidebar().queryByText('Settings')).toBeNull();
    expect(sidebar().queryByText('POS')).toBeNull();
    expect(sidebar().queryByText('Billing')).toBeNull();
  });

  it('filters sidebar nav items for reception role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '3', email: 'reception@test.com', name: 'Reception', role: 'reception' },
      authStatus: 'authenticated', loading: false, signOut: mockSignOut,
    });
    renderLayout();
    expect(sidebar().getByText('Motel')).toBeTruthy();
    expect(sidebar().getByText('Reports')).toBeTruthy();
    expect(sidebar().queryByText('Kitchen')).toBeNull();
    expect(sidebar().queryByText('Settings')).toBeNull();
  });

  it('highlights active route in sidebar', () => {
    renderLayout('/dashboard');
    const links = document.querySelectorAll('a');
    let dashboardLink: HTMLAnchorElement | null = null;
    for (const link of links) {
      if (link.textContent?.trim().startsWith('Dashboard')) {
        dashboardLink = link;
        break;
      }
    }
    expect(dashboardLink?.className).toContain('bg-primary/10');
  });

  it('renders child route via Outlet', () => {
    renderLayout('/dashboard');
    expect(screen.getByText('Dashboard page')).toBeTruthy();
  });

  it('renders different child route', () => {
    renderLayout('/pos');
    expect(screen.getByText('POS page')).toBeTruthy();
  });

  it('calls signOut when sign out button clicked', () => {
    renderLayout();
    fireEvent.click(screen.getByLabelText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it('toggles theme when theme button clicked', () => {
    renderLayout();
    fireEvent.click(screen.getByLabelText('Switch to dark mode'));
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  it('shows moon icon for light theme', () => {
    renderLayout();
    expect(screen.getByLabelText('Switch to dark mode')).toBeTruthy();
  });

  it('calls refetchAllQueries and toast on refresh click', () => {
    renderLayout();
    fireEvent.click(screen.getByLabelText('Refresh all data'));
    expect(mockRefetchAllQueries).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith('Refreshing all data...', 'info');
  });

  it('opens sidebar on mobile menu button click', () => {
    renderLayout();
    fireEvent.click(screen.getByLabelText('Open sidebar'));
    const sidebar = document.querySelector('aside');
    expect(sidebar?.className).toContain('translate-x-0');
  });

  it('closes sidebar when close button clicked', () => {
    renderLayout();
    fireEvent.click(screen.getByLabelText('Open sidebar'));
    fireEvent.click(screen.getByLabelText('Close sidebar'));
    const sidebar = document.querySelector('aside');
    expect(sidebar?.className).toContain('-translate-x-full');
  });

  function bottomNav() {
    return within(document.querySelector('nav.fixed.bottom-0')!);
  }

  it('renders bottom navigation items', () => {
    renderLayout();
    expect(bottomNav().getByText('Home')).toBeTruthy();
    expect(bottomNav().getByText('Billing')).toBeTruthy();
    expect(bottomNav().getByText('POS')).toBeTruthy();
    expect(bottomNav().getByText('Orders')).toBeTruthy();
  });

  it('renders QueueStatusBadge', () => {
    renderLayout();
    expect(screen.getByTestId('queue-status-badge')).toBeTruthy();
  });

  it('calls syncAllTables on mount', () => {
    renderLayout();
    expect(mockSyncAllTables).toHaveBeenCalledOnce();
  });

});
