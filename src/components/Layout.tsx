import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/core/auth-context';
import { useSettings } from '../lib/core/settings-context';
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
  CreditCard,
  Loader2,
  Database,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
import { useSystemSync } from '../lib/hooks';
import type { SystemSyncReport } from '../lib/services/system-sync.service';
import { Button } from './ui/button';

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
  { label: 'Creditors', href: '/creditors', icon: CreditCard, roles: ['admin', 'manager', 'owner'] },
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
  '/creditors': () => import('../pages/creditors/CreditCollectionPage'),
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
  const { settings } = useSettings();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
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

  const [confirmSync, setConfirmSync] = useState(false);
  const [syncReport, setSyncReport] = useState<SystemSyncReport | null>(null);
  const systemSync = useSystemSync();

  const handleSyncClick = () => setConfirmSync(true);
  const syncBusy = systemSync.isPending;

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
          'fixed top-0 left-0 z-50 h-full border-r bg-card transition-all duration-200 ease-out',
          sidebarOpen ? 'w-64' : '',
          sidebarExpanded ? 'lg:w-64' : 'lg:w-16',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className={cn('flex h-16 items-center border-b', sidebarOpen || sidebarExpanded ? 'justify-between px-4 md:px-6' : 'justify-center px-2')}>
          {sidebarOpen || sidebarExpanded ? (
            <>
              <Link to="/dashboard" className="flex items-center gap-2 min-w-0" onClick={() => setSidebarOpen(false)}>
                <img src={logoSrc} alt={settings.business_name} className="h-6 w-6 rounded-full object-cover shrink-0" />
                <span className="font-bold text-base truncate">{settings.business_name}</span>
              </Link>
              <button
                className="lg:hidden p-3 rounded-md hover:bg-muted transition-colors"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : (
            <Link to="/dashboard" className="flex items-center justify-center w-full" onClick={() => setSidebarOpen(false)}>
              <img src={logoSrc} alt={settings.business_name} className="h-6 w-6 rounded-full object-cover shrink-0" />
            </Link>
          )}
        </div>

        <nav className={cn('overflow-y-auto pb-20', sidebarOpen || sidebarExpanded ? 'p-4 space-y-1' : 'p-2 space-y-1')}>
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
                  'flex items-center rounded-md text-sm font-medium transition-all duration-150',
                  sidebarOpen || sidebarExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center p-2.5',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                title={!sidebarOpen && !sidebarExpanded ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {(sidebarOpen || sidebarExpanded) && <span>{item.label}</span>}
                {active && (sidebarOpen || sidebarExpanded) && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className={cn('absolute bottom-0 left-0 right-0 border-t bg-card hidden lg:block', sidebarExpanded ? 'p-3' : 'p-2')}>
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className={cn(
              'flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground w-full',
              sidebarExpanded ? 'gap-2 px-3 py-2.5 text-sm' : 'p-2.5'
            )}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform duration-200', sidebarExpanded ? 'rotate-180' : '')} />
            {sidebarExpanded && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className={cn('flex flex-col min-h-screen', sidebarExpanded ? 'lg:pl-64' : 'lg:pl-16', isKeyboardOpen ? 'lg:pb-0' : '')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 md:px-6">
          <button
            className="p-3 rounded-md hover:bg-muted transition-colors -ml-1.5"
            onClick={() => {
              if (window.innerWidth >= 1024) {
                setSidebarExpanded(!sidebarExpanded);
              } else {
                setSidebarOpen(true);
              }
            }}
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Open sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>

          <QueueStatusBadge />

          <div className="flex-1" />

          <button
            onClick={handleSyncClick}
            disabled={syncBusy}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-90 relative group"
            title={syncBusy ? 'Synchronizing...' : 'Full system sync'}
            aria-label="Full system sync"
          >
            <div className="relative">
              {syncBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </div>
            <span className="sr-only">
              {syncBusy ? 'Synchronizing...' : 'Sync'}
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

      {/* Sync Confirmation */}
      <ConfirmDialog
        open={confirmSync}
        onOpenChange={setConfirmSync}
        title="Full System Sync?"
        description="Reconcile tables, invoices, rooms, bookings, customer balances, stock levels, and inventory holds across the entire system."
        consequence="Data inconsistencies across all modules will be detected and fixed automatically."
        entity="entire system"
        confirmLabel="Sync Now"
        isPending={systemSync.isPending}
        onConfirm={() => {
          setConfirmSync(false);
          systemSync.mutate({ performed_by: user?.id }, {
            onSuccess: (data) => {
              setSyncReport(data.report);
              toast('System sync completed', 'success');
            },
            onError: (e) => toast(`Sync failed: ${(e as Error).message}`, 'error'),
          });
        }}
      />

      {/* Sync Progress Dialog */}
      <Dialog open={systemSync.isPending && !syncReport}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Full System Synchronization
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-3">
            <div className="flex justify-center items-center gap-2 text-xs text-muted-foreground">
              <Database className="h-4 w-4" />
              <span>tables · invoices · rooms · bookings · customers · stock</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Reconciling table statuses, invoice states, room occupancy, checking out past-due bookings, verifying customer balances, rebuilding stock running balances, releasing expired holds…
            </p>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '50%' }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync Report Dialog */}
      <Dialog open={!!syncReport} onOpenChange={(o) => { if (!o) setSyncReport(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              System Sync Complete
            </DialogTitle>
          </DialogHeader>
          {syncReport && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Tables Fixed</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{syncReport.summary.tables_fixed}</p>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400">Invoices Fixed</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{syncReport.summary.invoices_fixed}</p>
                </div>
                <div className="bg-violet-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-violet-600 dark:text-violet-400">Rooms Fixed</p>
                  <p className="text-lg font-bold text-violet-600 dark:text-violet-400">{syncReport.summary.rooms_fixed}</p>
                </div>
                <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-amber-600 dark:text-amber-400">Auto Checked Out</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{syncReport.summary.auto_checked_out}</p>
                </div>
                <div className="bg-purple-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-purple-600 dark:text-purple-400">Balances Fixed</p>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{syncReport.summary.balances_fixed}</p>
                </div>
                <div className="bg-cyan-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-cyan-600 dark:text-cyan-400">Stock Fixed</p>
                  <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{syncReport.summary.stock_fixed}</p>
                </div>
                <div className="bg-orange-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-orange-600 dark:text-orange-400">Low Stock Items</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{syncReport.summary.low_stock_count}</p>
                </div>
                <div className="bg-rose-500/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-rose-600 dark:text-rose-400">Holds Released</p>
                  <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{syncReport.summary.inventory_holds_released}</p>
                </div>
              </div>

              {/* Orphaned warnings */}
              {(syncReport.summary.orphaned_orders > 0 || syncReport.summary.orphaned_services > 0) && (
                <div className="bg-red-500/5 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Orphaned References Detected
                  </p>
                  {syncReport.summary.orphaned_orders > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {syncReport.summary.orphaned_orders} order(s) reference deleted/inactive tables
                    </p>
                  )}
                  {syncReport.summary.orphaned_services > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {syncReport.summary.orphaned_services} room service(s) reference deleted/inactive rooms
                    </p>
                  )}
                </div>
              )}

              {/* Per-step details */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Steps Completed</p>
                {syncReport.results.map((r) => (
                  <div key={r.step} className="flex justify-between items-center bg-muted/30 rounded px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      {r.status === 'ok' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      )}
                      <span className="text-xs capitalize">{r.step.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</span>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {syncReport.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">Errors ({syncReport.errors.length}):</p>
                  <ul className="text-xs space-y-1 max-h-24 overflow-y-auto">
                    {syncReport.errors.map((e, i) => (
                      <li key={i} className="text-red-500 bg-red-500/5 rounded px-2 py-1">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Low stock detail */}
              {(() => {
                const stockStep = syncReport.results.find(r => r.step === 'stock_balance') as unknown as { low_stock_items?: Array<{ id: string; name: string; current_stock: number; reorder_level: number }> } | undefined;
                const items = stockStep?.low_stock_items;
                return items && items.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-amber-600 mb-1">Low Stock Items:</p>
                    <div className="text-xs space-y-1 max-h-20 overflow-y-auto">
                      {items.map((item) => (
                        <div key={item.id} className="flex justify-between bg-amber-500/5 rounded px-2 py-1">
                          <span>{item.name}</span>
                          <span className="text-muted-foreground">{item.current_stock} / {item.reorder_level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="text-right text-xs text-muted-foreground">Completed in {syncReport.duration}</div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSyncReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
