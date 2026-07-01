import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../../lib/core/insforge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { UserProfile, Role } from '../../types';
import { showSuccess, showError } from '../../components/ui/toast';
import { UserCheck, UserX, Search, Settings, X, Mail, KeyRound, Phone, User, ShieldCheck, Trash2 } from 'lucide-react';

const ROLES: Role[] = ['admin', 'manager', 'owner', 'staff', 'kitchen', 'reception'];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-destructive/10 text-destructive',
  manager: 'bg-primary/10 text-primary',
  owner: 'bg-primary/10 text-primary',
  staff: 'bg-muted text-muted-foreground',
  kitchen: 'bg-secondary text-secondary-foreground',
  reception: 'bg-accent text-accent-foreground',
};

export default function UserRoleManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [savingAuth, setSavingAuth] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserProfile | null>(null);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserProfile[];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await insforge.database
        .from('user_profiles')
        .update({ role })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      showSuccess('User role updated');
    },
    onError: (err) => showError((err as Error).message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await insforge.database
        .from('user_profiles')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      showSuccess('User status updated');
    },
    onError: (err) => showError((err as Error).message),
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, name, phone }: { id: string; name: string; phone: string }) => {
      const { error } = await insforge.database
        .from('user_profiles')
        .update({ name: name || null, phone: phone || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      showSuccess('Profile updated');
    },
    onError: (err) => showError((err as Error).message),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('user_profiles')
        .update({ is_active: false, role: 'staff' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      showSuccess('User deactivated');
    },
    onError: (err) => showError((err as Error).message),
  });

  const handleSaveAuth = async () => {
    if (!editingUser) return;
    setSavingAuth(true);
    try {
      const payload: { userId: string; email?: string; password?: string } = {
        userId: editingUser.id,
      };
      if (editEmail && editEmail !== editingUser.email) payload.email = editEmail;
      if (editPassword) payload.password = editPassword;

      if (!payload.email && !payload.password) {
        showError('No changes to save');
        setSavingAuth(false);
        return;
      }

      const { data, error } = await insforge.functions.invoke('admin-update-user', {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      setEditPassword('');
      setEditingUser(null);
      showSuccess('User credentials updated');
    } catch (err) {
      showError((err as Error).message || 'Failed to update credentials');
    } finally {
      setSavingAuth(false);
    }
  };

  const openEditor = (profile: UserProfile) => {
    setEditName(profile.name || '');
    setEditPhone(profile.phone || '');
    setEditEmail(profile.email || '');
    setEditPassword('');
    setEditingUser(profile);
  };

  const filtered = (profiles ?? []).filter((p) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 border-t-4 border-t-blue-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage staff accounts, roles, and credentials</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent outline-none w-48 text-sm"
            aria-label="Search users"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-muted-foreground animate-pulse">Loading users...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
          <p className="text-muted-foreground">No users found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((profile) => (
                <tr key={profile.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {profile.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <span className="text-sm font-medium">{profile.name || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{profile.email || '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={profile.role}
                      onChange={(e) => updateRole.mutate({ id: profile.id, role: e.target.value as Role })}
                      className={`rounded-md px-2 py-1 text-xs font-medium border-0 cursor-pointer ${ROLE_BADGE[profile.role] || 'bg-muted text-muted-foreground'}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1.5 text-xs ${profile.is_active ? 'text-primary' : 'text-destructive'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${profile.is_active ? 'bg-emerald-500' : 'bg-destructive'}`} />
                      {profile.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditor(profile)}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors"
                        title="Account settings"
                        aria-label={`Account settings for ${profile.name}`}
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => toggleActive.mutate({ id: profile.id, is_active: !profile.is_active })}
                        disabled={toggleActive.isPending}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                        title={profile.is_active ? 'Deactivate user' : 'Activate user'}
                        aria-label={profile.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {profile.is_active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-primary" />}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteUser(profile)}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors"
                        title="Deactivate user"
                        aria-label={`Deactivate ${profile.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingUser(null)} role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {editingUser.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{editingUser.name || 'Unnamed'}</h2>
                  <p className="text-xs text-muted-foreground">{editingUser.role}</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-1 rounded-md hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone
                </label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+977 98XXXXXXXX"
                />
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auth Credentials</span>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email
                  </label>
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="user@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    New Password
                  </label>
                  <input
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    type="password"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Leave blank to keep current"
                  />
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Changes are applied via the admin edge function. The INSFORGE_ADMIN_KEY env var must be set on the function for this to work.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateProfile.mutate({ id: editingUser.id, name: editName, phone: editPhone })}
                  disabled={updateProfile.isPending}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
                </button>
                <button
                  onClick={handleSaveAuth}
                  disabled={savingAuth || (!editPassword && editEmail === editingUser.email)}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {savingAuth ? 'Updating...' : 'Update Credentials'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteUser !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteUser(null); }}
        title="Deactivate User"
        description={`Deactivate ${confirmDeleteUser?.name || confirmDeleteUser?.email}?`}
        consequence="The user will be immediately deactivated and cannot log in. All active sessions will be terminated."
        entity={`User: ${confirmDeleteUser?.name || confirmDeleteUser?.email || ""}`}
        confirmLabel="Deactivate User"
        onConfirm={() => {
          if (!confirmDeleteUser) return;
          deleteUser.mutate(confirmDeleteUser.id, {
            onSuccess: () => {
              setConfirmDeleteUser(null);
            },
            onError: (err) => showError((err as Error).message),
          });
        }}
        isPending={deleteUser.isPending}
      />
    </div>
  );
}
