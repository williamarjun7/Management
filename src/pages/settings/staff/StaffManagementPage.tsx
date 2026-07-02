import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../lib/core/auth-context';
import {
  Users, Search, Plus, MoreVertical,
  Shield, Key, UserCheck, UserX, Archive, Eye, Edit3,
  Trash2, Loader2, CheckCircle2, AlertTriangle,
  Clock, Smartphone, Globe, Monitor, LogOut,
  ChevronLeft, ChevronRight, Mail, Phone, MapPin, Briefcase,
  Calendar, BadgeCheck, UserCog, Copy, Save, X, Send, KeyRound,
  RefreshCw, Database, Activity,
} from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '../../../components/ui/avatar';
import { showSuccess, showError } from '../../../components/ui/toast';
import { Select } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
import { Switch } from '../../../components/ui/switch';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import {
  useStaffDirectory, useStaffDetail, useCreateStaff, useUpdateStaff,
  useVerifyStaff, useUpdateStaffStatus, useDeleteStaff,
  useRoles, useRoleWithPermissions, useCreateRole, useUpdateRole, useDeleteRole, useDuplicateRole,
  useAssignStaffRole,
  useAllPermissions, useToggleRolePermission,
  useSetStaffPermissionOverride, useRemoveStaffPermissionOverride,
  useStaffSessions, useTerminateSession, useTerminateAllSessions,
  useStaffActivityLogs, useStaffSecurityLogs,
  useAdminResetPassword, useAdminUpdateEmail, useAdminSendVerification,
  useBulkUpdateStatus, useBulkAssignRole, useAdminCheckAuth,
  useAdminResyncStaff,
} from '../../../lib/hooks';
import type {
  StaffProfile, StaffRole, Permission,
  StaffStatus, VerificationStatus, StaffDepartment, CreateStaffInput,
  StaffSession, StaffActivityLog, StaffSecurityLog,
} from '../../../types';
import type { SyncReport } from '../../../lib/services/staff-admin.service';

const DEPARTMENTS: { value: StaffDepartment; label: string }[] = [
  { value: 'management', label: 'Management' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'service', label: 'Service' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'reception', label: 'Reception' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
];

const STATUS_STYLES: Record<StaffStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  inactive: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  suspended: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  locked: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  archived: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
};

const AUTH_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  unconfirmed: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  not_found: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  error: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
};

const VERIFICATION_STYLES: Record<VerificationStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  verified: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  suspended: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
};

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Filter Chips ───
const QUICK_FILTERS = [
  { key: 'all', label: 'All Staff', icon: Users },
  { key: 'active', label: 'Active', icon: CheckCircle2 },
  { key: 'suspended', label: 'Suspended', icon: AlertTriangle },
  { key: 'pending', label: 'Pending Verification', icon: Clock },
  { key: 'verified', label: 'Verified', icon: BadgeCheck },
  { key: 'administrator', label: 'Managers', icon: UserCog },
  { key: 'cashier', label: 'Cashiers', icon: Users },
  { key: 'kitchen_staff', label: 'Kitchen Staff', icon: Users },
  { key: 'archived', label: 'Archived', icon: Archive },
];

export default function StaffManagementPage() {
  return (
    <div className="space-y-6 max-w-4xl border-t-4 border-t-gray-500 pt-4">
      <div>
        <h1 className="text-xl font-bold">Staff Management</h1>
        <p className="text-sm text-muted-foreground">Manage staff accounts, roles, and permissions</p>
      </div>

      <Tabs defaultValue="directory">
        <TabsList className="flex-wrap">
          <TabsTrigger value="directory">Staff Directory</TabsTrigger>
          <TabsTrigger value="roles">Role Management</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-4">
          <StaffDirectory />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <RoleManagement />
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrix />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STAFF DIRECTORY
// ═══════════════════════════════════════════════════

function StaffDirectory() {
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewStaff, setViewStaff] = useState<StaffProfile | null>(null);
  const [editStaff, setEditStaff] = useState<StaffProfile | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [authStatuses, setAuthStatuses] = useState<Record<string, string>>({});
  const [confirmResync, setConfirmResync] = useState(false);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);

  const { user } = useAuth();
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkAssignRole = useBulkAssignRole();
  const verifyStaff = useVerifyStaff();
  const checkAuth = useAdminCheckAuth();
  const resyncStaff = useAdminResyncStaff();
  const syncDone = useRef(false);

  useEffect(() => {
    if (!bulkAction || selected.length === 0) return;
    if (bulkAction === 'assign_role') {
      const roleId = prompt('Enter role ID to assign:');
      if (!roleId) { setBulkAction(null); return; }
      bulkAssignRole.mutate({ staff_ids: selected, role_id: roleId, assigned_by: user?.id }, {
        onSuccess: (res) => { showSuccess(`Role assigned to ${res.updated} staff`); setBulkAction(null); setSelected([]); },
        onError: (e) => { showError((e as Error).message); setBulkAction(null); },
      });
    } else if (bulkAction === 'verify') {
      // verify all selected
      let count = 0;
      selected.forEach(id => {
        verifyStaff.mutate({ staff_id: id, status: 'verified', verified_by: user?.id });
        count++;
      });
      showSuccess(`Verification queued for ${count} staff`);
      setBulkAction(null);
      setSelected([]);
    } else {
      const status = bulkAction as StaffStatus;
      bulkUpdateStatus.mutate({ staff_ids: selected, status, changed_by: user?.id }, {
        onSuccess: (res) => { showSuccess(`${res.updated} staff updated to ${status}`); setBulkAction(null); setSelected([]); },
        onError: (e) => { showError((e as Error).message); setBulkAction(null); },
      });
    }
  }, [bulkAction]);

  const statusMap: Record<string, StaffStatus | undefined> = {
    active: 'active', suspended: 'suspended', archived: 'archived',
  };
  const verificationMap: Record<string, VerificationStatus | undefined> = {
    pending: 'pending', verified: 'verified',
  };

  let effectiveStatus: StaffStatus | undefined;
  let effectiveVerification: VerificationStatus | undefined;

  if (quickFilter !== 'all') {
    effectiveStatus = statusMap[quickFilter];
    effectiveVerification = verificationMap[quickFilter];
  }
  const { data: directory, isLoading } = useStaffDirectory({
    search: search || undefined,
    status: effectiveStatus,
    verification: effectiveVerification,
    page,
    limit: 25,
  });

  const staffList = directory?.data ?? [];
  const total = directory?.total ?? 0;

  // Check real auth statuses on directory load & auto-sync mismatches
  useEffect(() => {
    if (!directory?.data || syncDone.current) return;
    const ids = directory.data.map(s => s.auth_user_id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    checkAuth.mutate(ids, {
      onSuccess: (data) => {
        const map: Record<string, string> = {};
        const toUpdate: { staff_id: string; status: VerificationStatus }[] = [];
        for (const staff of directory.data) {
          const authId = staff.auth_user_id;
          if (authId && data.auth_statuses[authId]) {
            const authStatus = data.auth_statuses[authId].status;
            map[staff.id] = authStatus;
            if ((authStatus === 'not_found' || authStatus === 'unconfirmed') && staff.verification_status === 'verified') {
              toUpdate.push({ staff_id: staff.id, status: 'pending' });
            }
          } else if (!authId) {
            map[staff.id] = 'not_found';
          }
        }
        setAuthStatuses(map);
        syncDone.current = true;
        if (toUpdate.length > 0) {
          toUpdate.forEach(({ staff_id, status }) => {
            verifyStaff.mutate({ staff_id, status, verified_by: user?.id });
          });
          showSuccess(`Auto-synced ${toUpdate.length} staff verification statuses`);
        }
      },
    });
  }, [directory, user?.id]);
  const totalPages = Math.ceil(total / 25);

  const allSelected = staffList.length > 0 && selected.length === staffList.length;

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (allSelected) setSelected([]);
    else setSelected(staffList.map(s => s.id));
  }

  return (
    <div className="space-y-4">
      {/* Search & Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, employee ID..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">{selected.length} selected</span>
              <Select
                value={bulkAction ?? ''}
                onChange={e => setBulkAction(e.target.value)}
                options={[
                  { value: '', label: 'Bulk Action...' },
                  { value: 'verify', label: 'Verify' },
                  { value: 'activate', label: 'Activate' },
                  { value: 'suspend', label: 'Suspend' },
                  { value: 'archive', label: 'Archive' },
                  { value: 'assign_role', label: 'Assign Role' },
                ]}
                className="w-40"
              />
            </div>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Staff
          </Button>
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <Mail className="mr-2 h-4 w-4" /> Invite
          </Button>
          <Button variant="outline" onClick={() => setConfirmResync(true)} disabled={resyncStaff.isPending}>
            {resyncStaff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {resyncStaff.isPending ? 'Syncing...' : 'Re-sync'}
          </Button>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {QUICK_FILTERS.map(f => {
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => { setQuickFilter(f.key); setPage(1); setSelected([]); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                quickFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm font-medium">No staff found</p>
              <p className="text-xs">Try adjusting your search or filters</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr className="border-b">
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Staff</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Department</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Role</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Verification</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden 2xl:table-cell">Auth</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Last Login</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => (
                  <StaffRow
                    key={staff.id}
                    staff={staff}
                    selected={selected.includes(staff.id)}
                    onToggle={() => toggleSelect(staff.id)}
                    onView={() => setViewStaff(staff)}
                    onEdit={() => setEditStaff(staff)}
                    authStatus={authStatuses[staff.id]}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 25 + 1}-{Math.min(page * 25, total)} of {total}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Staff Detail Dialog */}
      {viewStaff && <StaffDetailDialog staffId={viewStaff.id} onClose={() => setViewStaff(null)} />}

      {/* Invite Staff Dialog */}
      {inviteOpen && <InviteStaffDialog onClose={() => setInviteOpen(false)} />}

      {/* Create Staff Dialog */}
      {createOpen && <CreateStaffDialog onClose={() => setCreateOpen(false)} />}

      {/* Edit Staff Dialog */}
      {editStaff && <EditStaffDialog staff={editStaff} onClose={() => setEditStaff(null)} />}

      {/* Resync Confirmation */}
      <ConfirmDialog
        open={confirmResync}
        onOpenChange={setConfirmResync}
        title="Re-sync Staff Directory?"
        description="Compare all auth users against the staff database, create missing records, update changed data, and flag orphaned records."
        consequence="Staff records will be created, updated, and orphaned records flagged."
        entity="staff directory"
        confirmLabel="Re-sync"
        isPending={resyncStaff.isPending}
        onConfirm={() => {
          setConfirmResync(false);
          resyncStaff.mutate({ performed_by: user?.id }, {
            onSuccess: (data) => {
              setSyncReport(data.report);
            },
            onError: (e) => showError((e as Error).message),
          });
        }}
      />

      {/* Resync Progress Dialog */}
      <Dialog open={resyncStaff.isPending && !syncReport}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              Synchronizing Staff Records
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-3">
            <div className="flex justify-center">
              <div className="flex items-center gap-1">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">auth system</span>
                <Activity className="h-3 w-3 mx-1 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">staff database</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Fetching auth users, comparing records, creating missing entries, updating changes, and repairing relationships…
            </p>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resync Report */}
      <Dialog open={!!syncReport} onOpenChange={(o) => { if (!o) setSyncReport(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-500" />
              Synchronization Complete
            </DialogTitle>
          </DialogHeader>
          {syncReport && (
            <div className="space-y-4">
              {/* Summary counts */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Auth Users</p>
                  <p className="text-lg font-bold">{syncReport.auth_total}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">DB Records</p>
                  <p className="text-lg font-bold">{syncReport.db_total}</p>
                </div>
              </div>

              <Separator />

              {/* Created / Updated / Repaired */}
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-emerald-500/10 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Created</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{syncReport.created}</p>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400">Updated</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{syncReport.updated}</p>
                </div>
                <div className="bg-violet-500/10 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-violet-600 dark:text-violet-400">Repaired</p>
                  <p className="text-lg font-bold text-violet-600 dark:text-violet-400">{syncReport.relationships_repaired}</p>
                </div>
              </div>

              <Separator />

              {/* Detail counts */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Verification Updated</span>
                  <span className="font-semibold">{syncReport.verification_updated}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Phone Verified Updated</span>
                  <span className="font-semibold">{syncReport.phone_verified_updated}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Email Changes Applied</span>
                  <span className="font-semibold">{syncReport.email_changed}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Metadata Updated</span>
                  <span className="font-semibold">{syncReport.metadata_updated}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">User Metadata</span>
                  <span className="font-semibold">{syncReport.user_metadata_updated}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">App Metadata</span>
                  <span className="font-semibold">{syncReport.app_metadata_updated}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Last Login Synced</span>
                  <span className="font-semibold">{syncReport.last_login_updated}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Orphaned Records</span>
                  <span className={`font-semibold ${syncReport.orphaned > 0 ? 'text-red-500' : ''}`}>{syncReport.orphaned}</span>
                </div>
                <div className="flex justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Errors</span>
                  <span className={`font-semibold ${syncReport.errors.length > 0 ? 'text-red-500' : ''}`}>{syncReport.errors.length}</span>
                </div>
              </div>

              {/* Orphaned records detail */}
              {syncReport.orphaned_records.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Orphaned Staff Records (no matching auth user — flagged for review):
                  </p>
                  <div className="text-xs space-y-1 max-h-24 overflow-y-auto">
                    {syncReport.orphaned_records.map(r => (
                      <div key={r.id} className="flex justify-between bg-red-500/5 rounded px-2 py-1">
                        <span>{r.name}</span>
                        <span className="text-muted-foreground">{r.email || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {syncReport.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">Errors:</p>
                  <ul className="text-xs space-y-1 max-h-24 overflow-y-auto">
                    {syncReport.errors.map((e, i) => (
                      <li key={i} className="text-red-500 bg-red-500/5 rounded px-2 py-1">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-right text-xs text-muted-foreground">Completed in {syncReport.duration}</div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSyncReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Staff Row ───

function StaffRow({ staff, selected, onToggle, onView, onEdit, authStatus }: {
  staff: StaffProfile;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  onEdit: () => void;
  authStatus?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const menuHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= menuHeight ? rect.bottom + 8 : rect.top - menuHeight - 8;
    const right = window.innerWidth - rect.right;
    setMenuStyle({ position: 'fixed', top: Math.max(8, top), right: Math.max(8, right), zIndex: 20 });
  }, [menuOpen]);

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="rounded border-gray-300" />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onView}>
          <Avatar className="h-9 w-9">
            <AvatarImage src={staff.avatar_url ?? undefined} />
            <AvatarFallback>{getInitials(staff.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{staff.full_name}</p>
            <p className="text-xs text-muted-foreground">{staff.email ?? staff.username}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 hidden md:table-cell">
        <span className="text-sm">{staff.department ? DEPARTMENTS.find(d => d.value === staff.department)?.label ?? staff.department : '—'}</span>
      </td>
      <td className="px-3 py-3 hidden lg:table-cell">
        <span className="text-sm">{staff.role_name ?? '—'}</span>
      </td>
      <td className="px-3 py-3">
        <Badge className={`text-xs ${STATUS_STYLES[staff.status] ?? ''}`} variant="outline">
          {staff.status.charAt(0).toUpperCase() + staff.status.slice(1)}
        </Badge>
      </td>
      <td className="px-3 py-3 hidden xl:table-cell">
        <Badge className={`text-xs ${VERIFICATION_STYLES[staff.verification_status] ?? ''}`} variant="outline">
          {staff.verification_status.charAt(0).toUpperCase() + staff.verification_status.slice(1)}
        </Badge>
      </td>
      <td className="px-3 py-3 hidden 2xl:table-cell">
        {authStatus ? (
          <Badge className={`text-xs ${AUTH_STATUS_STYLES[authStatus] ?? ''}`} variant="outline">
            {authStatus === 'active' ? 'Active' : authStatus === 'unconfirmed' ? 'Unconfirmed' : authStatus === 'not_found' ? 'Not Found' : 'Error'}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 hidden sm:table-cell">
        <span className="text-xs text-muted-foreground">{timeAgo(staff.last_login)}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="relative">
          <div ref={menuRef}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div style={menuStyle} className="w-48 rounded-lg border bg-background shadow-lg py-1">
                <button onClick={() => { onView(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                  <Eye className="h-4 w-4" /> View Profile
                </button>
                <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                  <Edit3 className="h-4 w-4" /> Edit
                </button>
                <Separator className="my-1" />
                <StaffQuickActions staff={staff} onDone={() => setMenuOpen(false)} />
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Staff Quick Actions ───

function StaffQuickActions({ staff, onDone }: { staff: StaffProfile; onDone: () => void }) {
  const { user } = useAuth();
  const verifyStaff = useVerifyStaff();
  const updateStatus = useUpdateStaffStatus();
  const deleteStaff = useDeleteStaff();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  function handleVerify(status: VerificationStatus) {
    verifyStaff.mutate({ staff_id: staff.id, status, verified_by: user?.id }, {
      onSuccess: () => { showSuccess(`Staff ${status}`); onDone(); },
      onError: (e) => showError((e as Error).message),
    });
  }

  function handleStatus(status: StaffStatus) {
    updateStatus.mutate({ staff_id: staff.id, status, changed_by: user?.id }, {
      onSuccess: () => { showSuccess(`Staff ${status}`); onDone(); },
      onError: (e) => showError((e as Error).message),
    });
  }

  if (confirmAction === 'verify') {
    return (
      <div className="px-3 py-2 space-y-1">
        <p className="text-xs text-muted-foreground mb-1">Set verification:</p>
        <button onClick={() => { handleVerify('verified'); setConfirmAction(null); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded">Verify</button>
        <button onClick={() => { handleVerify('rejected'); setConfirmAction(null); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded">Reject</button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setConfirmAction('verify')} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
        <BadgeCheck className="h-4 w-4" /> Verify / Reject
      </button>
      {staff.status !== 'suspended' && (
        <button onClick={() => { handleStatus('suspended'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <UserX className="h-4 w-4" /> Suspend
        </button>
      )}
      {staff.status === 'suspended' && (
        <button onClick={() => { handleStatus('active'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <UserCheck className="h-4 w-4" /> Activate
        </button>
      )}
      {staff.status !== 'locked' && (
        <button onClick={() => { handleStatus('locked'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Shield className="h-4 w-4" /> Lock Account
        </button>
      )}
      {staff.status === 'locked' && (
        <button onClick={() => { handleStatus('active'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Shield className="h-4 w-4" /> Unlock Account
        </button>
      )}
      {staff.status !== 'archived' && (
        <button onClick={() => { handleStatus('archived'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Archive className="h-4 w-4" /> Archive
        </button>
      )}
      <Separator className="my-1" />
      <button onClick={() => { deleteStaff.mutate(staff.id, { onSuccess: () => { showSuccess('Staff deleted'); onDone(); }, onError: (e) => showError((e as Error).message) }); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
        <Trash2 className="h-4 w-4" /> Delete
      </button>
    </>
  );
}

// ═══════════════════════════════════════════════════
// STAFF DETAIL DIALOG
// ═══════════════════════════════════════════════════

function StaffDetailDialog({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const { data, isLoading } = useStaffDetail(staffId);
  const { data: sessions } = useStaffSessions(staffId);
  const { data: activity } = useStaffActivityLogs(staffId);
  const { data: security } = useStaffSecurityLogs(staffId);
  const [activeTab, setActiveTab] = useState('profile');
  const [resetPwStaff, setResetPwStaff] = useState<StaffProfile | null>(null);
  const [changeEmailStaff, setChangeEmailStaff] = useState<StaffProfile | null>(null);
  const adminSendVerif = useAdminSendVerification();

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!data) return null;

  const { profile, role, active_sessions } = data;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback>{getInitials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg">{profile.full_name}</p>
              <p className="text-sm font-normal text-muted-foreground">@{profile.username} · {profile.employee_id}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="auth">Authentication</TabsTrigger>
            <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
            <TabsTrigger value="sessions">Sessions ({active_sessions?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={Mail} label="Email" value={profile.email ?? '—'} />
              <InfoItem icon={Phone} label="Phone" value={profile.phone ?? '—'} />
              <InfoItem icon={MapPin} label="Address" value={profile.address ?? '—'} />
              <InfoItem icon={BadgeCheck} label="Employee ID" value={profile.employee_id} />
              <InfoItem icon={UserCog} label="Username" value={profile.username} />
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-24">Status:</span>
                <Badge className={`text-xs ${STATUS_STYLES[profile.status]}`} variant="outline">
                  {profile.status.charAt(0).toUpperCase() + profile.status.slice(1)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-24">Verification:</span>
                <Badge className={`text-xs ${VERIFICATION_STYLES[profile.verification_status]}`} variant="outline">
                  {profile.verification_status.charAt(0).toUpperCase() + profile.verification_status.slice(1)}
                </Badge>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="employment" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={Briefcase} label="Department" value={profile.department ? DEPARTMENTS.find(d => d.value === profile.department)?.label ?? profile.department : '—'} />
              <InfoItem icon={UserCog} label="Position" value={profile.position ?? '—'} />
              <InfoItem icon={Calendar} label="Join Date" value={formatDate(profile.join_date)} />
              <InfoItem icon={Globe} label="Branch" value={profile.branch ?? 'main'} />
              <InfoItem icon={Shield} label="Role" value={role?.name ?? '—'} />
            </div>
          </TabsContent>

          <TabsContent value="auth" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={LogOut} label="Last Login" value={timeAgo(profile.last_login)} />
              <InfoItem icon={LogOut} label="Last Logout" value={timeAgo(profile.last_logout)} />
              <InfoItem icon={Smartphone} label="Active Sessions" value={String(active_sessions?.length ?? 0)} />
              <InfoItem icon={AlertTriangle} label="Failed Login Attempts" value={String(profile.failed_login_attempts)} />
              <InfoItem icon={Key} label="Password Last Changed" value={timeAgo(profile.password_changed_at)} />
              <InfoItem icon={BadgeCheck} label="Email Verified" value={profile.email ? 'Yes' : 'No'} />
              <InfoItem icon={BadgeCheck} label="Phone Verified" value={profile.phone ? 'Yes' : 'No'} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" variant="outline" onClick={() => setResetPwStaff(profile)}>
                <KeyRound className="mr-2 h-4 w-4" /> Reset Password
              </Button>
              {profile.auth_user_id && (
                <Button size="sm" variant="outline" onClick={() => setChangeEmailStaff(profile)}>
                  <Mail className="mr-2 h-4 w-4" /> Change Email
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => adminSendVerif.mutate(profile.email ?? '', {
                onSuccess: () => showSuccess('Verification email sent'),
                onError: (e: Error) => showError(e.message),
              })}>
                <Send className="mr-2 h-4 w-4" /> Send Verification
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="roles" className="mt-4 space-y-4">
            <RolePermissionView staffId={staffId} />
          </TabsContent>

          <TabsContent value="sessions" className="mt-4">
            <SessionsView sessions={sessions ?? []} staffId={staffId} />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <LogsView logs={activity ?? []} type="activity" />
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <LogsView logs={security ?? []} type="security" />
          </TabsContent>
        </Tabs>

        {resetPwStaff && (
          <ResetPasswordDialog
            staff={resetPwStaff}
            onClose={() => setResetPwStaff(null)}
          />
        )}
        {changeEmailStaff && (
          <ChangeEmailDialog
            staff={changeEmailStaff}
            onClose={() => setChangeEmailStaff(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

// ─── Role & Permission View ───

function RolePermissionView({ staffId }: { staffId: string }) {
  const { user } = useAuth();
  const { data: detail } = useStaffDetail(staffId);
  const { data: allPermissions } = useAllPermissions();
  const { data: roles } = useRoles();
  const assignRole = useAssignStaffRole();
  const setOverride = useSetStaffPermissionOverride();
  const removeOverride = useRemoveStaffPermissionOverride();

  if (!detail) return null;

  const overrides = detail.permission_overrides ?? [];

  const groupedPerms = (allPermissions ?? []).reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Role Assignment */}
      <div>
        <Label className="text-sm font-medium">Assigned Role</Label>
        <div className="flex gap-2 mt-1">
          <Select
            value={detail.profile.role_id ?? ''}
            onChange={e => {
              if (e.target.value) {
                assignRole.mutate({ staff_id: staffId, role_id: e.target.value, assigned_by: user?.id }, {
                  onSuccess: () => showSuccess('Role assigned'),
                  onError: (err) => showError((err as Error).message),
                });
              }
            }}
            options={[
              { value: '', label: 'No role' },
              ...(roles ?? []).map(r => ({ value: r.id, label: r.name })),
            ]}
            className="flex-1"
          />
        </div>
      </div>

      <Separator />

      {/* Permission Overrides */}
      <div>
        <p className="text-sm font-medium mb-2">Permission Overrides</p>
        <p className="text-xs text-muted-foreground mb-3">Grant or deny specific permissions for this staff member</p>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {Object.entries(groupedPerms).map(([module, perms]) => (
            <div key={module}>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{module}</p>
              <div className="space-y-1">
                {perms.map(perm => {
                  const override = overrides.find(o => o.permission_id === perm.id);
                  const grantType = override?.grant_type;
                  return (
                    <div key={perm.id} className="flex items-center justify-between py-1">
                      <span className="text-sm">{perm.name}</span>
                      <div className="flex gap-1">
                        <Button
                          variant={grantType === 'grant' ? 'default' : 'ghost'}
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setOverride.mutate({ staff_id: staffId, permission_id: perm.id, grant_type: 'grant' })}
                        >
                          Grant
                        </Button>
                        <Button
                          variant={grantType === 'deny' ? 'destructive' : 'ghost'}
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setOverride.mutate({ staff_id: staffId, permission_id: perm.id, grant_type: 'deny' })}
                        >
                          Deny
                        </Button>
                        {grantType && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => removeOverride.mutate({ staff_id: staffId, permission_id: perm.id })}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sessions View ───

function SessionsView({ sessions, staffId }: { sessions: StaffSession[]; staffId: string }) {
  const terminate = useTerminateSession();
  const terminateAll = useTerminateAllSessions(staffId);

  return (
    <div className="space-y-3">
      {sessions.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => terminateAll.mutate(undefined, { onSuccess: () => showSuccess('All sessions terminated') })}>
            <LogOut className="mr-2 h-4 w-4" /> Terminate All
          </Button>
        </div>
      )}
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No sessions found</p>
      ) : (
        sessions.map(session => (
          <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{session.browser ?? 'Unknown Browser'} on {session.operating_system ?? 'Unknown OS'}</p>
                <p className="text-xs text-muted-foreground">
                  {session.device ?? 'Unknown device'} · {session.ip_address ?? '—'} · {timeAgo(session.login_time)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {session.is_active ? (
                <Badge variant="success" className="text-xs">Active</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Ended</Badge>
              )}
              {session.is_active && (
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => terminate.mutate(session.id, { onSuccess: () => showSuccess('Session terminated') })}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Logs View ───

function LogsView({ logs, type }: { logs: (StaffActivityLog | StaffSecurityLog)[]; type: 'activity' | 'security' }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No {type} logs found</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
          <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${type === 'security' ? 'bg-orange-500' : 'bg-blue-500'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{'action' in log ? log.action : log.event_type}</p>
            <p className="text-xs text-muted-foreground">{log.description ?? '—'}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
              {log.ip_address && <span className="text-xs text-muted-foreground">· {log.ip_address}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// CREATE STAFF DIALOG
// ═══════════════════════════════════════════════════

function CreateStaffDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const createStaff = useCreateStaff();
  const { data: roles } = useRoles();
  const [form, setForm] = useState<CreateStaffInput>({
    full_name: '', username: '', email: '', phone: '', address: '',
    employee_id: '', department: 'other', position: '', branch: 'main',
    join_date: new Date().toISOString().split('T')[0],
    role_id: undefined, status: 'active', verification_status: 'pending',
  });

  function handleSubmit() {
    if (!form.full_name || !form.username || !form.email) {
      showError('Full name, username, and email are required');
      return;
    }
    createStaff.mutate({ ...form, created_by: user?.id }, {
      onSuccess: (data) => {
        showSuccess(`Staff created: ${form.full_name} (${data.employee_id})`);
        onClose();
      },
      onError: (e) => showError((e as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Staff Account</DialogTitle>
          <DialogDescription>Add a new staff member to the system</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserCog className="h-4 w-4" /> Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Username *</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="johndoe" />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+977-98..." />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Input value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Briefcase className="h-4 w-4" /> Employment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Employee ID</Label>
                <Input value={form.employee_id ?? ''} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} placeholder="Auto-generated if empty" />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={form.department ?? 'other'}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value as StaffDepartment }))}
                  options={DEPARTMENTS.map(d => ({ value: d.value, label: d.label }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Input value={form.position ?? ''} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Senior Waiter" />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} placeholder="main" />
              </div>
              <div className="space-y-1.5">
                <Label>Joining Date</Label>
                <Input type="date" value={form.join_date ?? ''} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield className="h-4 w-4" /> Security & Role</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Initial Role</Label>
                <Select
                  value={form.role_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, role_id: e.target.value || undefined }))}
                  options={[
                    { value: '', label: 'No role' },
                    ...(roles ?? []).map(r => ({ value: r.id, label: r.name })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account Status</Label>
                <Select
                  value={form.status ?? 'active'}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as StaffStatus }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Verification Status</Label>
                <Select
                  value={form.verification_status ?? 'pending'}
                  onChange={e => setForm(f => ({ ...f, verification_status: e.target.value as VerificationStatus }))}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'verified', label: 'Verified' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createStaff.isPending}>
            {createStaff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Staff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// EDIT STAFF DIALOG
// ═══════════════════════════════════════════════════

function EditStaffDialog({ staff, onClose }: { staff: StaffProfile; onClose: () => void }) {
  const updateStaff = useUpdateStaff();
  const { data: roles } = useRoles();
  const [form, setForm] = useState({
    full_name: staff.full_name,
    username: staff.username,
    email: staff.email ?? '',
    phone: staff.phone ?? '',
    address: staff.address ?? '',
    position: staff.position ?? '',
    branch: staff.branch,
    department: staff.department,
    role_id: staff.role_id ?? '',
    status: staff.status,
    verification_status: staff.verification_status,
  });

  function handleSubmit() {
    updateStaff.mutate({ id: staff.id, ...form }, {
      onSuccess: () => { showSuccess('Staff updated'); onClose(); },
      onError: (e) => showError((e as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Staff</DialogTitle>
          <DialogDescription>Update {staff.full_name}'s details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value as StaffDepartment }))}
                options={DEPARTMENTS.map(d => ({ value: d.value, label: d.label }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role_id}
                onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
                options={[
                  { value: '', label: 'No role' },
                  ...(roles ?? []).map(r => ({ value: r.id, label: r.name })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account Status</Label>
              <Select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as StaffStatus }))}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'suspended', label: 'Suspended' },
                  { value: 'locked', label: 'Locked' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Verification</Label>
              <Select
                value={form.verification_status}
                onChange={e => setForm(f => ({ ...f, verification_status: e.target.value as VerificationStatus }))}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'verified', label: 'Verified' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateStaff.isPending}>
            {updateStaff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// ROLE MANAGEMENT
// ═══════════════════════════════════════════════════

function RoleManagement() {
  const { user } = useAuth();
  const { data: roles, isLoading } = useRoles();
  const [selectedRole, setSelectedRole] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<StaffRole | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffRole | null>(null);

  const { data: roleDetail } = useRoleWithPermissions(selectedRole);
  const { data: allPermissions } = useAllPermissions();
  const togglePerm = useToggleRolePermission();
  const deleteRole = useDeleteRole();
  const duplicateRole = useDuplicateRole();

  const rolePermIds = new Set((roleDetail?.permissions ?? []).map(p => p.id));

  const groupedPerms = (allPermissions ?? []).reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Roles</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Role
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role List */}
        <Card className="lg:col-span-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="divide-y">
              {(roles ?? []).map(role => (
                <div
                  key={role.id}
                  className={`flex items-center justify-between p-3 cursor-pointer transition-colors hover:bg-muted/50 ${selectedRole === role.id ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedRole(role.id)}
                >
                  <div>
                    <p className="text-sm font-medium">{role.name}</p>
                    <p className="text-xs text-muted-foreground">{role.slug}</p>
                  </div>
                  <div className="flex gap-1">
                    {!role.is_system && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setEditRole(role); }} title="Edit">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); duplicateRole.mutate({ role_id: role.id, new_name: role.name + ' (Copy)', new_slug: role.slug + '_copy_' + Date.now(), created_by: user?.id }, { onSuccess: () => showSuccess('Role duplicated') }); }} title="Duplicate">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); setConfirmDelete(role); }} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {role.is_system && (
                      <Badge variant="secondary" className="text-[10px]">System</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Role Permissions */}
        <Card className="lg:col-span-2 p-4">
          {!selectedRole ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Shield className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Select a role to manage its permissions</p>
            </div>
          ) : !roleDetail ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold">{roleDetail.role.name}</h4>
                <p className="text-xs text-muted-foreground">{roleDetail.role.description ?? 'No description'}</p>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {Object.entries(groupedPerms).map(([module, perms]) => (
                  <div key={module}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{module}</p>
                    <div className="space-y-1">
                      {perms.map(perm => (
                        <div key={perm.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                          <span className="text-sm">{perm.name}</span>
                          <Switch
                            checked={rolePermIds.has(perm.id)}
                            onCheckedChange={checked => {
                              togglePerm.mutate({ role_id: selectedRole, permission_id: perm.id, granted: checked });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Create Role Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>Add a new role with custom permissions</DialogDescription>
          </DialogHeader>
          <CreateRoleForm onClose={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      {editRole && (
        <Dialog open onOpenChange={() => setEditRole(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
              <DialogDescription>Update role name and description</DialogDescription>
            </DialogHeader>
            <EditRoleForm role={editRole} onClose={() => setEditRole(null)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={o => { if (!o) setConfirmDelete(null); }}
        title="Delete Role"
        description={`Delete "${confirmDelete?.name}"?`}
        consequence="Staff members with this role will have their role removed. System roles cannot be deleted."
        entity={`Role: ${confirmDelete?.name ?? ''}`}
        confirmLabel="Delete Role"
        onConfirm={() => {
          if (!confirmDelete) return;
          deleteRole.mutate(confirmDelete.id, {
            onSuccess: () => { showSuccess('Role deleted'); setConfirmDelete(null); setSelectedRole(undefined); },
            onError: (e) => showError((e as Error).message),
          });
        }}
        isPending={deleteRole.isPending}
      />
    </div>
  );
}

function CreateRoleForm({ onClose }: { onClose: () => void }) {
  const createRole = useCreateRole();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit() {
    if (!name || !slug) { showError('Name and slug are required'); return; }
    createRole.mutate({ name, slug: slug.toLowerCase().replace(/\s+/g, '_'), description }, {
      onSuccess: () => { showSuccess('Role created'); onClose(); },
      onError: (e) => showError((e as Error).message),
    });
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-1.5">
        <Label>Role Name</Label>
        <Input value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g, '_')); }} placeholder="e.g. Floor Manager" />
      </div>
      <div className="space-y-1.5">
        <Label>Slug</Label>
        <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="floor_manager" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Role description" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={createRole.isPending}>
          {createRole.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create
        </Button>
      </DialogFooter>
    </div>
  );
}

function EditRoleForm({ role, onClose }: { role: StaffRole; onClose: () => void }) {
  const update = useUpdateRole();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');

  function handleSubmit() {
    update.mutate({ id: role.id, name, description }, {
      onSuccess: () => { showSuccess('Role updated'); onClose(); },
      onError: (e) => showError((e as Error).message),
    });
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-1.5">
        <Label>Role Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PERMISSION MATRIX
// ═══════════════════════════════════════════════════

function PermissionMatrix() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: allPermissions, isLoading: permsLoading } = useAllPermissions();
  const togglePerm = useToggleRolePermission();

  const groupedPerms = (allPermissions ?? []).reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  // Get all permissions per role
  const [rolePermMap, setRolePermMap] = useState<Record<string, Set<string>>>({});

  return (
    <Card className="overflow-hidden">
      {rolesLoading || permsLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Module / Permission</th>
                {(roles ?? []).map(role => (
                  <th key={role.id} className="px-3 py-3 text-center font-medium text-muted-foreground text-xs">{role.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedPerms).map(([module, perms]) => (
                <>
                  <tr key={module} className="border-b bg-muted/20">
                    <td className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase" colSpan={(roles?.length ?? 0) + 1}>
                      {module}
                    </td>
                  </tr>
                  {perms.map(perm => (
                    <RowWithPermissions
                      key={perm.id}
                      permission={perm}
                      roles={roles ?? []}
                      rolePermMap={rolePermMap}
                      onToggle={async (roleId, granted) => {
                        togglePerm.mutate({ role_id: roleId, permission_id: perm.id, granted });
                        setRolePermMap(prev => {
                          const next = { ...prev };
                          if (!next[roleId]) next[roleId] = new Set();
                          if (granted) next[roleId].add(perm.id);
                          else next[roleId].delete(perm.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RowWithPermissions({ permission, roles, rolePermMap, onToggle }: {
  permission: Permission;
  roles: StaffRole[];
  rolePermMap: Record<string, Set<string>>;
  onToggle: (roleId: string, granted: boolean) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  async function handleToggle(roleId: string) {
    const current = checked[roleId] ?? rolePermMap[roleId]?.has(permission.id) ?? false;
    setChecked(prev => ({ ...prev, [roleId]: !current }));
    await onToggle(roleId, !current);
  }

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2.5 text-sm">{permission.name}</td>
      {roles.map(role => (
        <td key={role.id} className="px-3 py-2.5 text-center">
          <Switch
            checked={checked[role.id] ?? rolePermMap[role.id]?.has(permission.id) ?? false}
            onCheckedChange={() => handleToggle(role.id)}
          />
        </td>
      ))}
    </tr>
  );
}

// ═══════════════════════════════════════════════════
// RESET PASSWORD DIALOG
// ═══════════════════════════════════════════════════

function ResetPasswordDialog({ staff, onClose }: { staff: StaffProfile; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const resetPw = useAdminResetPassword();

  function handleSubmit() {
    if (password.length < 8) { showError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { showError('Passwords do not match'); return; }
    if (!staff.auth_user_id) { showError('Staff has no auth user account'); return; }
    resetPw.mutate({ auth_user_id: staff.auth_user_id, password }, {
      onSuccess: () => { showSuccess('Password reset successful'); onClose(); },
      onError: (e: Error) => showError(e.message),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>Set a new password for {staff.full_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
          </div>
          <AlertTriangle className="h-4 w-4 text-amber-500 inline-block mr-1" />
          <span className="text-xs text-muted-foreground">The staff member will need to log in with the new password on next attempt.</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={resetPw.isPending}>
            {resetPw.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// CHANGE EMAIL DIALOG
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// INVITE STAFF DIALOG
// ═══════════════════════════════════════════════════

function InviteStaffDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const createStaff = useCreateStaff();
  const { data: roles } = useRoles();
  const sendVerif = useAdminSendVerification();
  const [form, setForm] = useState<CreateStaffInput & { send_invite: boolean }>({
    full_name: '', username: '', email: '', phone: '', address: '',
    employee_id: '', department: 'other', position: '', branch: 'main',
    join_date: new Date().toISOString().split('T')[0],
    role_id: undefined, status: 'active', verification_status: 'pending',
    send_invite: true,
  });

  function handleSubmit() {
    if (!form.full_name || !form.email) {
      showError('Full name and email are required'); return;
    }
    const payload = {
      ...form,
      username: form.username || form.email.split('@')[0],
      created_by: user?.id,
    };
    createStaff.mutate(payload, {
      onSuccess: (data) => {
        if (form.send_invite && data) {
          sendVerif.mutate(form.email, {
            onSuccess: () => showSuccess(`Invitation sent to ${form.full_name}`),
            onError: () => showSuccess(`Staff created but invitation email could not be sent`),
          });
        } else {
          showSuccess(`Staff created: ${form.full_name}`);
        }
        onClose();
      },
      onError: (e) => showError((e as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Staff Member</DialogTitle>
          <DialogDescription>Create an account and send an invitation email</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserCog className="h-4 w-4" /> Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value || form.email.split('@')[0] }))} placeholder="Auto from email" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+977-98..." />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as StaffDepartment }))} options={DEPARTMENTS.map(d => ({ value: d.value, label: d.label }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Input value={form.position ?? ''} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Waiter" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role_id ?? ''} onChange={e => setForm(f => ({ ...f, role_id: e.target.value || undefined }))} options={[{ value: '', label: 'No role' }, ...(roles ?? []).map(r => ({ value: r.id, label: r.name }))]} />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <input type="checkbox" id="send_invite" checked={form.send_invite} onChange={e => setForm(f => ({ ...f, send_invite: e.target.checked }))} className="rounded border-gray-300" />
            <Label htmlFor="send_invite" className="text-sm cursor-pointer">Send invitation email with verification link</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createStaff.isPending}>
            {createStaff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeEmailDialog({ staff, onClose }: { staff: StaffProfile; onClose: () => void }) {
  const [email, setEmail] = useState(staff.email ?? '');
  const [confirm, setConfirm] = useState('');
  const changeEmail = useAdminUpdateEmail();

  function handleSubmit() {
    if (!email) { showError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('Invalid email format'); return; }
    if (email !== confirm) { showError('Emails do not match'); return; }
    if (!staff.auth_user_id) { showError('Staff has no auth user account'); return; }
    changeEmail.mutate({ auth_user_id: staff.auth_user_id, email, staff_id: staff.id }, {
      onSuccess: () => { showSuccess('Email changed successfully'); onClose(); },
      onError: (e: Error) => showError(e.message),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Email</DialogTitle>
          <DialogDescription>Update email address for {staff.full_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>New Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Email</Label>
            <Input type="email" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat email" />
          </div>
          <AlertTriangle className="h-4 w-4 text-amber-500 inline-block mr-1" />
          <span className="text-xs text-muted-foreground">The staff member will need to use the new email on next login.</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={changeEmail.isPending}>
            {changeEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Change Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
