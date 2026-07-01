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
  Building2,
  Flag,
  List,
  Sun,
  Moon,
  ChevronRight,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../lib/core/theme-context';
import { OfflineBanner, useConnectionState } from './OfflineBanner';
import { BottomSheet } from './ui/bottom-sheet';
import { PageTransition } from './PageTransition';
import { useKeyboardAware } from '../lib/hooks/useKeyboardAware';
import { syncAllTables } from '../lib/services/table-occupancy';
import logoSrc from '../assets/logo.png';
import { QueueStatusBadge } from './QueueStatusBadge';
import { toast } from './ui/toast';
import { performFullSync, onSyncStateChange, type SyncStatus } from '../lib/services/sync-service';

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
  { label: 'Inventory', href: '/inventory', icon: Package, roles: ['admin', 'manager', 'staff', 'owner'] },
  { label: 'Billing', href: '/billing', icon: Receipt, roles: ['admin', 'manager', 'staff'] },
  { label: 'Customers', href: '/customers', icon: Users, roles: ['admin', 'manager', 'staff', 'owner'] },
  { label: 'Motel', href: '/motel', icon: Hotel, roles: ['admin', 'reception', 'staff'] },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'owner', 'reception'] },
  { label: 'Analytics', href: '/analytics', icon: Activity, roles: ['admin', 'owner'] },
  { label: 'Rooms', href: '/admin/rooms', icon: Building2, roles: ['admin', 'manager'] },
  { label: 'Audit Log', href: '/audit', icon: ScrollText, roles: ['admin'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  { label: 'System Health', href: '/system-health', icon: Activity, roles: ['admin'] },
  { label: 'App Updates', href: '/admin/updates', icon: RefreshCw, roles: ['admin'] },
  { label: 'Feature Flags', href: '/admin/features', icon: Flag, roles: ['admin'] },
  { label: 'Queue Inspector', href: '/admin/queue', icon: List, roles: ['admin'] },
];

const bottomNavItems: { label: string; href: string; icon: React.ElementType }[] = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'POS', href: '/pos', icon: ShoppingCart },
  { label: 'Orders', href: '/orders', icon: ClipboardList },
  { label: 'Billing', href: '/billing', icon: Receipt },
];

const routePrefetch: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../pages/dashboard/DashboardPage'),
  '/tables': () => import('../pages/admin/TableManagementPage'),
  '/pos': () => import('../pages/pos/PosPage'),
  '/orders': () => import('../pages/orders/OrdersPage'),
  '/kitchen': () => import('../pages/kitchen/KitchenPage'),
  '/menu': () => import('../pages/menu/MenuPage'),
  '/inventory': () => import('../pages/inventory/InventoryPage'),
  '/billing': () => import('../pages/billing/BillingPage'),
  '/customers': () => import('../pages/customers/CustomersPage'),
  '/motel': () => import('../pages/motel/MotelPage'),
  '/reports': () => import('../pages/reports/ReportsPage'),
  '/analytics': () => import('../pages/admin/OperationalAnalytics'),
  '/admin/rooms': () => import('../pages/admin/DiningRoomsPage'),
  '/audit': () => import('../pages/admin/AuditLogPage'),
  '/settings': () => import('../pages/settings/SettingsPage'),
  '/system-health': () => import('../pages/admin/SystemHealthPage'),
  '/admin/updates': () => import('../pages/admin/AppUpdatesPage'),
  '/admin/features': () => import('../pages/admin/FeatureFlagsPage'),
  '/admin/queue': () => import('../pages/admin/QueueInspectorPage'),
};

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href) || pathname === href;
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const conn = useConnectionState();
  const { keyboardHeight, isKeyboardOpen } = useKeyboardAware();

  const mainRef = useRef<HTMLElement>(null);

  const userRole = user?.role ?? 'staff';

  const visibleItems = navItems.filter(
    (item) => item.roles.includes(userRole)
  );

  const handleSignOut = async () => {
    await signOut();
  };

  const prefetchRoute = useCallback((href: string) => {
    const imp = routePrefetch[href];
    if (imp) imp().catch(() => {});
  }, []);

  const isMoreActive = !bottomNavItems.some(
    (item) => item.href === location.pathname || location.pathname.startsWith(item.href + '/')
  ) && location.pathname !== '/';

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncTooltip, setSyncTooltip] = useState('Sync');

  useEffect(() => {
    return onSyncStateChange((state) => {
      setSyncStatus(state.status);
      if (state.status === 'success') {
        setSyncTooltip(`Sync completed\nLast sync: ${state.lastSynced?.toLocaleTimeString() || ''}`);
      } else if (state.status === 'error') {
        setSyncTooltip(`Sync failed\n${state.error || 'Tap to retry'}`);
      } else if (state.status === 'syncing') {
        setSyncTooltip(state.progress || 'Syncing...');
      }
    });
  }, []);

  const handleSync = async () => {
    if (syncStatus === 'syncing') return;
    toast('Starting sync...', 'info');
    const result = await performFullSync();
    if (result.status === 'success') {
      toast('Sync completed successfully', 'success');
    } else if (result.status === 'error' && result.error) {
      toast(`Sync failed: ${result.error}`, 'error');
    }
  };

  const scrollPositions = useRef<Record<string, number>>({});
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    syncAllTables();
  }, []);

  useEffect(() => {
    const key = location.pathname;
    const main = mainRef.current;
    if (main) {
      const saved = scrollPositions.current[key];
      if (saved !== undefined) {
        requestAnimationFrame(() => {
          main.scrollTop = saved;
        });
      } else {
        main.scrollTop = 0;
      }
    }
    return () => {
      if (main) {
        scrollPositions.current[key] = main.scrollTop;
      }
    };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 border-r bg-card transition-transform duration-200 ease-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 md:px-6 border-b">
          <Link to="/dashboard" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
            <img src={logoSrc} alt="Highlands Cafe & Motel Inn" className="h-6 w-6 rounded-full object-cover" />
            <span className="font-bold text-lg">Highlands Cafe & Motel Inn</span>
          </Link>
          <button
            className="lg:hidden p-3 rounded-md hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto pb-20">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(location.pathname, item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                onMouseEnter={() => prefetchRoute(item.href)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={cn('lg:pl-64 flex flex-col min-h-screen', isKeyboardOpen ? 'lg:pb-0' : '')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 md:px-6">
          <button
            className="lg:hidden p-3 rounded-md hover:bg-muted transition-colors -ml-1.5"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <QueueStatusBadge />

          <div className="flex-1" />

          <button
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-90 relative group"
            title={syncTooltip}
            aria-label="Sync data"
          >
            <div className="relative">
              {syncStatus === 'syncing' ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : syncStatus === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : syncStatus === 'error' ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </div>
            <span className="sr-only">
              {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'success' ? 'Synced' : syncStatus === 'error' ? 'Sync Failed' : 'Sync'}
            </span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span key={theme} className="flex animate-theme-icon">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
          </button>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
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
              className="ml-1 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main
          ref={mainRef}
          className={cn(
            'flex-1 overflow-y-auto',
            isKeyboardOpen ? '' : 'pb-20 lg:pb-6'
          )}
          style={isKeyboardOpen ? { paddingBottom: keyboardHeight } : undefined}
        >
          <div className="p-4 md:p-6">
            <OfflineBanner state={conn.state} lastSynced={conn.lastSynced} />
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center border-t bg-card/95 backdrop-blur-md lg:hidden safe-area-bottom">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(location.pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-14 text-[11px] font-medium transition-colors relative',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <Icon className={cn('h-5 w-5 transition-transform duration-200', active && 'fill-current')} />
              </div>
              {item.label}
              {active && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreSheetOpen(true)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 h-14 text-[11px] font-medium transition-colors relative',
            isMoreActive
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Menu className="h-5 w-5" />
          More
          {isMoreActive && (
            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
          )}
        </button>
      </nav>

      <BottomSheet
        open={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        title="All Pages"
      >
        <div className="space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(location.pathname, item.href);
            const isInBottomNav = bottomNavItems.some((b) => b.href === item.href);
            if (isInBottomNav) return null;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMoreSheetOpen(false)}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-lg',
                  active ? 'bg-primary/15' : 'bg-muted'
                )}>
                  <Icon className={cn('h-4 w-4', active && 'text-primary')} />
                </div>
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </Link>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-border px-4">
          <button
            onClick={() => {
              setMoreSheetOpen(false);
              handleSignOut();
            }}
            className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-destructive/10">
              <LogOut className="h-4 w-4" />
            </div>
            <span>Sign Out</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
