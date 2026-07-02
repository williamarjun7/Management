import { insforge } from '../core/insforge';

type StaffAdminAction = 'update_email' | 'reset_password' | 'get_user' | 'send_verification' | 'update_metadata' | 'check_auth' | 'resync';

type StaffAdminPayload = {
  action: StaffAdminAction;
  userId?: string;
  email?: string;
  password?: string;
  metadata?: Record<string, unknown>;
  userIds?: string[];
  performed_by?: string;
};

type StaffAdminResponse<T = unknown> = { data?: T; error?: string };

export async function callStaffAdmin(
  action: StaffAdminAction,
  payload: Omit<StaffAdminPayload, 'action'>,
): Promise<StaffAdminResponse> {
  const { data, error } = await insforge.functions.invoke('staff-admin', {
    body: { action, ...payload },
  });
  if (error) return { error: error.message || 'Staff admin request failed' };
  return { data: data as Record<string, unknown> };
}

export async function adminUpdateEmail(staffAuthUserId: string, newEmail: string) {
  return callStaffAdmin('update_email', { userId: staffAuthUserId, email: newEmail });
}

export async function adminResetPassword(staffAuthUserId: string, newPassword: string) {
  return callStaffAdmin('reset_password', { userId: staffAuthUserId, password: newPassword });
}

export async function adminGetUser(staffAuthUserId: string) {
  return callStaffAdmin('get_user', { userId: staffAuthUserId });
}

export async function adminSendVerificationEmail(email: string) {
  return callStaffAdmin('send_verification', { email });
}

export async function adminUpdateMetadata(
  staffAuthUserId: string,
  metadata: Record<string, unknown>,
) {
  return callStaffAdmin('update_metadata', { userId: staffAuthUserId, metadata });
}

export type AuthStatusMap = Record<string, { exists: boolean; confirmed: boolean; status: 'active' | 'unconfirmed' | 'not_found' | 'error' }>;

export async function adminCheckAuthUsers(userIds: string[]): Promise<StaffAdminResponse<{ auth_statuses: AuthStatusMap }>> {
  return callStaffAdmin('check_auth', { userIds }) as Promise<StaffAdminResponse<{ auth_statuses: AuthStatusMap }>>;
}

export type SyncReport = {
  auth_total: number;
  db_total: number;
  created: number;
  updated: number;
  verification_updated: number;
  phone_verified_updated: number;
  email_changed: number;
  metadata_updated: number;
  user_metadata_updated: number;
  app_metadata_updated: number;
  last_login_updated: number;
  relationships_repaired: number;
  orphaned: number;
  orphaned_records: { id: string; name: string; email: string | null }[];
  errors: string[];
  duration: string;
};

export async function adminResyncStaff(performedBy?: string): Promise<StaffAdminResponse<{ report: SyncReport }>> {
  return callStaffAdmin('resync', { performed_by: performedBy }) as Promise<StaffAdminResponse<{ report: SyncReport }>>;
}
