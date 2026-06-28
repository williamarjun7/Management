import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/core/auth-context';
import { initSentry, Sentry } from './lib/services/sentry';
import { initRealtime, shutdownRealtime } from './lib/services/realtime';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import type { Role } from './types';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignUpPage = lazy(() => import('./pages/auth/SignUpPage'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const AdminLoginPage = lazy(() => import('./pages/auth/AdminLoginPage'));
const AdminSignUpPage = lazy(() => import('./pages/auth/AdminSignUpPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const PosPage = lazy(() => import('./pages/pos/PosPage'));
const OrdersPage = lazy(() => import('./pages/orders/OrdersPage'));
const CreateOrderPage = lazy(() => import('./pages/orders/CreateOrderPage'));
const KitchenPage = lazy(() => import('./pages/kitchen/KitchenPage'));
const MenuPage = lazy(() => import('./pages/menu/MenuPage'));
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage'));
const BillingPage = lazy(() => import('./pages/billing/BillingPage'));
const InvoiceDetailPage = lazy(() => import('./pages/billing/InvoiceDetailPage'));
const MotelPage = lazy(() => import('./pages/motel/MotelPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const OperationalAnalytics = lazy(() => import('./pages/admin/OperationalAnalytics'));
const SystemHealthPage = lazy(() => import('./pages/admin/SystemHealthPage'));
const StaffPage = lazy(() => import('./pages/staff/StaffPage'));
const TableManagementPage = lazy(() => import('./pages/admin/TableManagementPage'));
const UserRoleManagement = lazy(() => import('./pages/admin/UserRoleManagement'));
const StaffActivityLogs = lazy(() => import('./pages/admin/StaffActivityLogs'));
const FeatureFlagsPage = lazy(() => import('./pages/admin/FeatureFlagsPage'));
const QueueInspectorPage = lazy(() => import('./pages/admin/QueueInspectorPage'));
const DiningRoomsPage = lazy(() => import('./pages/admin/DiningRoomsPage'));

function RoleRedirect() {
  return <Navigate to="/pos" replace />;
}

type RouteConfig = {
  path: string;
  element: React.ReactNode;
  roles?: Role[];
};

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const protectedRoutes: RouteConfig[] = [
  { path: '/', element: <RoleRedirect /> },
  { path: '/dashboard', element: <SuspenseWrapper><DashboardPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'kitchen', 'staff', 'reception'] },
  { path: '/pos', element: <SuspenseWrapper><PosPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/orders', element: <SuspenseWrapper><OrdersPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/orders/new', element: <SuspenseWrapper><CreateOrderPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/kitchen', element: <SuspenseWrapper><KitchenPage /></SuspenseWrapper>, roles: ['admin', 'kitchen'] },
  { path: '/menu', element: <SuspenseWrapper><MenuPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/inventory', element: <SuspenseWrapper><InventoryPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/billing', element: <SuspenseWrapper><BillingPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/billing/new', element: <Navigate to="/pos" replace /> },
  { path: '/billing/:id', element: <SuspenseWrapper><InvoiceDetailPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/motel', element: <SuspenseWrapper><MotelPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'reception', 'staff'] },
  { path: '/reports', element: <SuspenseWrapper><ReportsPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'owner', 'reception'] },
  { path: '/settings', element: <SuspenseWrapper><SettingsPage /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/audit', element: <SuspenseWrapper><AuditLogPage /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/analytics', element: <SuspenseWrapper><OperationalAnalytics /></SuspenseWrapper>, roles: ['admin', 'owner'] },
  { path: '/system-health', element: <SuspenseWrapper><SystemHealthPage /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/tables', element: <SuspenseWrapper><TableManagementPage /></SuspenseWrapper>, roles: ['admin', 'manager', 'staff'] },
  { path: '/admin/users', element: <SuspenseWrapper><UserRoleManagement /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/admin/activity', element: <SuspenseWrapper><StaffActivityLogs /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/admin/features', element: <SuspenseWrapper><FeatureFlagsPage /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/admin/queue', element: <SuspenseWrapper><QueueInspectorPage /></SuspenseWrapper>, roles: ['admin'] },
  { path: '/admin/rooms', element: <SuspenseWrapper><DiningRoomsPage /></SuspenseWrapper>, roles: ['admin', 'manager'] },
];

export default function App() {
  useEffect(() => {
    initSentry();
    initRealtime();
    return () => { shutdownRealtime(); };
  }, []);

  return (
    <AuthProvider>
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <Routes>
          <Route path="/login" element={<SuspenseWrapper><LoginPage /></SuspenseWrapper>} />
          <Route path="/signup" element={<SuspenseWrapper><SignUpPage /></SuspenseWrapper>} />
          <Route path="/admin/login" element={<SuspenseWrapper><AdminLoginPage /></SuspenseWrapper>} />
          <Route path="/admin/signup" element={<SuspenseWrapper><AdminSignUpPage /></SuspenseWrapper>} />
          <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
          <Route path="/verify-email" element={<SuspenseWrapper><VerifyEmail /></SuspenseWrapper>} />
          <Route path="/staff" element={<SuspenseWrapper><StaffPage /></SuspenseWrapper>} />
          <Route path="/pos" element={<SuspenseWrapper><PosPage /></SuspenseWrapper>} />
          <Route path="*" element={<RoleRedirect />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {protectedRoutes.map((r) => (
              <Route
                key={r.path}
                path={r.path}
                element={
                  r.roles ? (
                    <ProtectedRoute allowedRoles={r.roles}>
                      {r.element}
                    </ProtectedRoute>
                  ) : (
                    r.element
                  )
                }
              />
            ))}
          </Route>
        </Routes>
      </Sentry.ErrorBoundary>
    </AuthProvider>
  );
}

function ErrorFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-4xl">!</div>
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
