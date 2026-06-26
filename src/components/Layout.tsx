import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/core/auth-context';
import { cn } from '../lib/core/utils';
import type { Role } from '../types';
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  CookingPot,
  UtensilsCrossed,
  Package,
  Receipt,
  Hotel,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ScrollText,
  Activity,
  Table2,
  Flag,
  List,
  Sun,
  Moon,
} from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../lib/core/theme-context';
import { OfflineBanner, useConnectionState } from './OfflineBanner';
import logoSrc from '../assets/logo.png';
import { QueueStatusBadge } from './QueueStatusBadge';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: Role[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff', 'kitchen', 'reception'] },
  { label: 'Tables', href: '/tables', icon: Table2, roles: ['admin', 'manager', 'staff'] },
  { label: 'POS', href: '/pos', icon: ShoppingCart, roles: ['admin', 'manager', 'staff'] },
  { label: 'Orders', href: '/orders', icon: ClipboardList, roles: ['admin', 'manager', 'staff'] },
  { label: 'Kitchen', href: '/kitchen', icon: CookingPot, roles: ['admin', 'kitchen'] },
  { label: 'Menu', href: '/menu', icon: UtensilsCrossed, roles: ['admin', 'manager', 'staff'] },
  { label: 'Inventory', href: '/inventory', icon: Package, roles: ['admin', 'manager', 'staff'] },
  { label: 'Billing', href: '/billing', icon: Receipt, roles: ['admin', 'manager', 'staff'] },
  { label: 'Motel', href: '/motel', icon: Hotel, roles: ['admin', 'reception', 'staff'] },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'owner', 'reception'] },
  { label: 'Analytics', href: '/analytics', icon: Activity, roles: ['admin', 'owner'] },
  { label: 'Audit Log', href: '/audit', icon: ScrollText, roles: ['admin'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  { label: 'System Health', href: '/system-health', icon: Activity, roles: ['admin'] },
  { label: 'Feature Flags', href: '/admin/features', icon: Flag, roles: ['admin'] },
  { label: 'Queue Inspector', href: '/admin/queue', icon: List, roles: ['admin'] },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const conn = useConnectionState();

  const userRole = user?.role ?? 'staff';

  const visibleItems = navItems.filter(
    (item) => item.roles.includes(userRole)
  );

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 border-r bg-card transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src={logoSrc} alt="Highlands Cafe & Motel Inn" className="h-6 w-6 rounded-full object-cover" />
            <span className="font-bold text-lg">Highlands Cafe & Motel Inn</span>
          </Link>
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <QueueStatusBadge />

          <div className="flex-1" />

          <button
            onClick={toggleTheme}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span key={theme} className="flex animate-theme-icon">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
          </button>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">
                {user?.name ?? user?.email}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {userRole}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleSignOut}
              className="ml-2 p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="p-6">
          <OfflineBanner state={conn.state} lastSynced={conn.lastSynced} />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
