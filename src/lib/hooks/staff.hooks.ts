import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { writeAuditLog, createAuditEntry, AuditActions } from '../services/audit.service';
import type {
  StaffProfile, StaffDirectoryResponse, StaffDetailResponse,
  StaffRole, Permission, RoleWithPermissions,
  StaffSession, StaffActivityLog, StaffSecurityLog,
  StaffStatus, VerificationStatus, StaffDepartment, CreateStaffInput,
} from '../../types';

const STAFF_KEYS = {
  all: ['staff'] as const,
  directory: (params?: Record<string, unknown>) => ['staff', 'directory', params] as const,
  detail: (id: string) => ['staff', 'detail', id] as const,
  roles: ['staff', 'roles'] as const,
  roleWithPerms: (id: string) => ['staff', 'roles', id] as const,
  permissions: ['staff', 'permissions'] as const,
  sessions: (id: string) => ['staff', 'sessions', id] as const,
  activity: (id: string) => ['staff', 'activity', id] as const,
  security: (id: string) => ['staff', 'security', id] as const,
};

// ─── Staff Directory ───

export function useStaffDirectory(params?: {
  search?: string;
  role_id?: string;
  department?: StaffDepartment;
  status?: StaffStatus;
  verification?: VerificationStatus;
  page?: number;
  limit?: number;
}) {
  const { search, role_id, department, status, verification, page = 1, limit = 50 } = params ?? {};
  return useQuery({
    queryKey: STAFF_KEYS.directory(params),
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const { data, error } = await insforge.database.rpc('get_staff_directory', {
        p_search: search ?? null,
        p_role_id: role_id ?? null,
        p_department: department ?? null,
        p_status: status ?? null,
        p_verification: verification ?? null,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      return data as unknown as StaffDirectoryResponse;
    },
  });
}

// ─── Staff Detail ───

export function useStaffDetail(staffId: string | undefined) {
  return useQuery({
    queryKey: STAFF_KEYS.detail(staffId!),
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc('get_staff_detail', {
        p_staff_id: staffId,
      });
      if (error) throw error;
      return data as unknown as StaffDetailResponse;
    },
  });
}

// ─── Create Staff ───

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStaffInput & { created_by?: string }) => {
      const { data, error } = await insforge.database.rpc('create_staff_account', {
        p_full_name: input.full_name,
        p_username: input.username,
        p_email: input.email,
        p_phone: input.phone ?? null,
        p_address: input.address ?? null,
        p_employee_id: input.employee_id ?? null,
        p_department: input.department ?? 'other',
        p_position: input.position ?? null,
        p_branch: input.branch ?? 'main',
        p_join_date: input.join_date ?? new Date().toISOString().split('T')[0],
        p_role_id: input.role_id ?? null,
        p_status: input.status ?? 'active',
        p_verification_status: input.verification_status ?? 'pending',
        p_created_by: input.created_by ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; staff_id: string; employee_id: string };
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, 'staff_profile', data.staff_id));
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Update Staff ───

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<StaffProfile> & { id: string }) => {
      const { id, ...updates } = input;
      const { error } = await insforge.database
        .from('staff_profiles')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, 'staff_profile', vars.id));
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
      qc.invalidateQueries({ queryKey: STAFF_KEYS.detail(vars.id) });
    },
  });
}

// ─── Verify Staff ───

export function useVerifyStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      staff_id: string;
      status: VerificationStatus;
      notes?: string;
      verified_by?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('verify_staff_account', {
        p_staff_id: input.staff_id,
        p_verified_by: input.verified_by ?? null,
        p_status: input.status,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; staff_id: string; verification_status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Update Staff Status ───

export function useUpdateStaffStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      staff_id: string;
      status: StaffStatus;
      reason?: string;
      changed_by?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('update_staff_status', {
        p_staff_id: input.staff_id,
        p_status: input.status,
        p_changed_by: input.changed_by ?? null,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; staff_id: string; status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Soft Delete Staff ───

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await insforge.database
        .from('staff_profiles')
        .update({ deleted_at: new Date().toISOString(), is_active: false, status: 'archived' })
        .eq('id', staffId);
      if (error) throw error;
    },
    onSuccess: (_data, staffId) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, 'staff_profile', staffId));
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Roles ───

export function useRoles() {
  return useQuery({
    queryKey: STAFF_KEYS.roles,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('roles')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffRole[];
    },
  });
}

export function useRoleWithPermissions(roleId: string | undefined) {
  return useQuery({
    queryKey: STAFF_KEYS.roleWithPerms(roleId!),
    enabled: !!roleId,
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc('get_role_with_permissions', {
        p_role_id: roleId,
      });
      if (error) throw error;
      return data as unknown as RoleWithPermissions;
    },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; description?: string }) => {
      const { data, error } = await insforge.database
        .from('roles')
        .insert([{ ...input, is_system: false }])
        .select()
        .single();
      if (error) throw error;
      return data as StaffRole;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, 'role', data.id, { new_state: { name: data.name } }));
      qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; description?: string }) => {
      const { id, ...rest } = input;
      const { error } = await insforge.database
        .from('roles')
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, 'role', vars.id));
      qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await insforge.database
        .from('roles')
        .update({ is_active: false })
        .eq('id', roleId);
      if (error) {
        const msg = (error as { message?: string })?.message ?? '';
        if (msg.includes('foreign key') || msg.includes('in use')) {
          throw new Error('Cannot delete role: it is currently assigned to staff members');
        }
        throw error;
      }
    },
    onSuccess: (_data, roleId) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, 'role', roleId));
      qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
    },
  });
}

export function useDuplicateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { role_id: string; new_name: string; new_slug: string; created_by?: string }) => {
      const { data, error } = await insforge.database.rpc('duplicate_role', {
        p_role_id: input.role_id,
        p_new_name: input.new_name,
        p_new_slug: input.new_slug,
        p_created_by: input.created_by ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; role_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
    },
  });
}

export function useAssignStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { staff_id: string; role_id: string; assigned_by?: string }) => {
      const { data, error } = await insforge.database.rpc('assign_staff_role', {
        p_staff_id: input.staff_id,
        p_role_id: input.role_id,
        p_assigned_by: input.assigned_by ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Permissions ───

export function useAllPermissions() {
  return useQuery({
    queryKey: STAFF_KEYS.permissions,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('permissions')
        .select('*')
        .order('module', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Permission[];
    },
  });
}

export function useToggleRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      role_id: string;
      permission_id: string;
      granted: boolean;
    }) => {
      if (input.granted) {
        const { error } = await insforge.database
          .from('role_permissions')
          .insert([{ role_id: input.role_id, permission_id: input.permission_id }]);
        if (error) {
          const msg = (error as { message?: string })?.message ?? '';
          if (!msg.includes('duplicate key') && !msg.includes('already exists')) throw error;
        }
      } else {
        const { error } = await insforge.database
          .from('role_permissions')
          .delete()
          .eq('role_id', input.role_id)
          .eq('permission_id', input.permission_id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.roleWithPerms(vars.role_id) });
    },
  });
}

export function useSetStaffPermissionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      staff_id: string;
      permission_id: string;
      grant_type: 'grant' | 'deny';
    }) => {
      const { error } = await insforge.database
        .from('staff_permissions')
        .upsert(
          [{ staff_id: input.staff_id, permission_id: input.permission_id, grant_type: input.grant_type }],
          { onConflict: 'staff_id, permission_id' }
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.detail(vars.staff_id) });
    },
  });
}

export function useRemoveStaffPermissionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { staff_id: string; permission_id: string }) => {
      const { error } = await insforge.database
        .from('staff_permissions')
        .delete()
        .eq('staff_id', input.staff_id)
        .eq('permission_id', input.permission_id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.detail(vars.staff_id) });
    },
  });
}

// ─── Sessions ───

export function useStaffSessions(staffId: string | undefined) {
  return useQuery({
    queryKey: STAFF_KEYS.sessions(staffId!),
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('staff_sessions')
        .select('*')
        .eq('staff_id', staffId)
        .order('login_time', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaffSession[];
    },
  });
}

export function useTerminateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await insforge.database
        .from('staff_sessions')
        .update({ is_active: false, logout_time: new Date().toISOString() })
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

export function useTerminateAllSessions(staffId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await insforge.database
        .from('staff_sessions')
        .update({ is_active: false, logout_time: new Date().toISOString() })
        .eq('staff_id', staffId)
        .eq('is_active', true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Activity & Security Logs ───

export function useStaffActivityLogs(staffId: string | undefined) {
  return useQuery({
    queryKey: STAFF_KEYS.activity(staffId!),
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('staff_activity_logs')
        .select('*')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as StaffActivityLog[];
    },
  });
}

export function useStaffSecurityLogs(staffId: string | undefined) {
  return useQuery({
    queryKey: STAFF_KEYS.security(staffId!),
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('staff_security_logs')
        .select('*')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as StaffSecurityLog[];
    },
  });
}

// ─── Bulk Actions ───

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      staff_ids: string[];
      status: StaffStatus;
      reason?: string;
      changed_by?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('bulk_update_staff_status', {
        p_staff_ids: input.staff_ids,
        p_status: input.status,
        p_changed_by: input.changed_by ?? null,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; updated: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

export function useBulkAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { staff_ids: string[]; role_id: string; assigned_by?: string }) => {
      const { data, error } = await insforge.database.rpc('bulk_assign_role', {
        p_staff_ids: input.staff_ids,
        p_role_id: input.role_id,
        p_assigned_by: input.assigned_by ?? null,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; updated: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    },
  });
}

// ─── Admin Auth Operations (via edge function) ───

import {
  adminUpdateEmail,
  adminResetPassword,
  adminGetUser,
  adminSendVerificationEmail,
  adminUpdateMetadata,
  adminCheckAuthUsers,
  adminResyncStaff,
} from '../services/staff-admin.service';

export function useAdminGetUser() {
  return useMutation({
    mutationFn: async (authUserId: string) => {
      const result = await adminGetUser(authUserId);
      if (result.error) throw new Error(result.error);
      return result;
    },
  });
}

export function useAdminUpdateEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { auth_user_id: string; email: string; staff_id: string }) => {
      const result = await adminUpdateEmail(input.auth_user_id, input.email);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.detail(vars.staff_id) });
    },
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: async (input: { auth_user_id: string; password: string }) => {
      const result = await adminResetPassword(input.auth_user_id, input.password);
      if (result.error) throw new Error(result.error);
      return result;
    },
  });
}

export function useAdminSendVerification() {
  return useMutation({
    mutationFn: async (email: string) => {
      const result = await adminSendVerificationEmail(email);
      if (result.error) throw new Error(result.error);
      return result;
    },
  });
}

export function useAdminUpdateMetadata() {
  return useMutation({
    mutationFn: async (input: { auth_user_id: string; metadata: Record<string, unknown> }) => {
      const result = await adminUpdateMetadata(input.auth_user_id, input.metadata);
      if (result.error) throw new Error(result.error);
      return result;
    },
  });
}

export function useAdminCheckAuth() {
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const result = await adminCheckAuthUsers(userIds);
      if (result.error) throw new Error(result.error);
      return result.data as { auth_statuses: Record<string, { exists: boolean; confirmed: boolean; status: string }> };
    },
  });
}

export function useAdminResyncStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { performed_by?: string }) => {
      const result = await adminResyncStaff(input?.performed_by);
      if (result.error) throw new Error(result.error);
      return result.data as { report: import('../services/staff-admin.service').SyncReport };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
      qc.invalidateQueries({ queryKey: STAFF_KEYS.directory() });
    },
  });
}
