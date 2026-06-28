import { useState } from 'react';
import { useTables, useDiningRooms } from '../../lib/hooks';
import { insforge } from '../../lib/core/insforge';
import { createTable, updateTable, toggleTableEnabled } from '../../components/tables/table.service';
import { showSuccess, showError } from '../../components/ui/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Plus, Search, Settings2, EyeOff, Eye, Save, X, Loader2, Users } from 'lucide-react';
import type { RestaurantTable } from '../../types';

export default function TableManagementPage() {
  const { data: tables, isLoading } = useTables({ all: true });
  const { data: rooms } = useDiningRooms();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ table_number: string; capacity: number; room_id: string; notes: string }>({ table_number: '', capacity: 4, room_id: '', notes: '' });
  const [newTable, setNewTable] = useState<{ table_number: string; capacity: number; room_id: string; notes: string }>({ table_number: '', capacity: 4, room_id: '', notes: '' });
  const [disableConfirm, setDisableConfirm] = useState<{ table: RestaurantTable; hasActiveOrders: boolean } | null>(null);

  const filtered = (tables ?? []).filter(t => {
    if (search && !t.table_number.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'active' && !t.is_active) return false;
    if (statusFilter === 'disabled' && t.is_active) return false;
    if (roomFilter !== 'all' && t.room_id !== roomFilter) return false;
    return true;
  });

  const roomName = (roomId: string | null) => {
    if (!roomId) return '—';
    return rooms?.find(r => r.id === roomId)?.name ?? '—';
  };

  const handleCreate = async () => {
    if (!newTable.table_number.trim() || !newTable.capacity) return;
    try {
      await createTable({
        table_number: newTable.table_number.trim(),
        capacity: newTable.capacity,
        room_id: newTable.room_id || undefined,
        notes: newTable.notes || undefined,
      });
      setShowCreate(false);
      setNewTable({ table_number: '', capacity: 4, room_id: '', notes: '' });
      showSuccess('Table created');
    } catch { showError('Failed to create table'); }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateTable(id, {
        table_number: editForm.table_number.trim(),
        capacity: editForm.capacity,
        room_id: editForm.room_id || null,
        notes: editForm.notes || null,
      });
      setEditingId(null);
      showSuccess('Table updated');
    } catch { showError('Failed to update table'); }
  };

  const handleToggle = async (table: RestaurantTable) => {
    if (table.is_active) {
      const { data: activeOrders } = await insforge.database
        .from('orders')
        .select('id')
        .eq('table_id', table.id)
        .not('status', 'in', '("cancelled","refunded")');
      if (activeOrders && activeOrders.length > 0) {
        setDisableConfirm({ table, hasActiveOrders: true });
        return;
      }
    }
    try {
      await toggleTableEnabled(table.id, !table.is_active);
      showSuccess(table.is_active ? 'Table disabled' : 'Table enabled');
    } catch { showError('Failed to update table'); }
  };

  const confirmDisable = async () => {
    if (!disableConfirm) return;
    try {
      await toggleTableEnabled(disableConfirm.table.id, false);
      setDisableConfirm(null);
      showSuccess('Table disabled');
    } catch { showError('Failed to disable table'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Table Management</h1>
          <p className="text-sm text-muted-foreground">Add, edit, enable or disable restaurant tables</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Table
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by table number..."
            className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={roomFilter}
          onChange={e => setRoomFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Rooms</option>
          {(rooms ?? []).map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Table</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Room</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Capacity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Active</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(table => (
                <tr key={table.id} className={`hover:bg-muted/30 transition-colors ${!table.is_active ? 'opacity-60' : ''}`}>
                  {editingId === table.id ? (
                    <td colSpan={6} className="p-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Table Number</label>
                          <input value={editForm.table_number} onChange={e => setEditForm(f => ({ ...f, table_number: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm" />
                        </div>
                        <div className="w-24">
                          <label className="text-xs text-muted-foreground">Capacity</label>
                          <input type="number" value={editForm.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: parseInt(e.target.value) || 4 }))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Room</label>
                          <select value={editForm.room_id} onChange={e => setEditForm(f => ({ ...f, room_id: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm">
                            <option value="">— No room —</option>
                            {(rooms ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Notes</label>
                          <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm" />
                        </div>
                        <div className="flex items-end gap-1 pb-0.5">
                          <button onClick={() => handleUpdate(table.id)} className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"><Save className="h-4 w-4" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg border hover:bg-accent"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">Table {table.table_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{roomName(table.room_id)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" /> {table.capacity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                          table.status === 'available' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          table.status === 'occupied' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            table.status === 'available' ? 'bg-emerald-500' :
                            table.status === 'occupied' ? 'bg-orange-500' :
                            'bg-muted-foreground'
                          }`} />
                          {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          table.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        }`}>
                          {table.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => {
                            setEditingId(table.id);
                            setEditForm({ table_number: table.table_number, capacity: table.capacity, room_id: table.room_id ?? '', notes: table.notes ?? '' });
                          }} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                            <Settings2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleToggle(table)} className={`p-1.5 rounded-lg hover:bg-accent transition-colors ${table.is_active ? 'text-muted-foreground hover:text-destructive' : 'text-muted-foreground hover:text-emerald-500'}`}>
                            {table.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48">
            <p className="text-muted-foreground">{search || statusFilter !== 'all' || roomFilter !== 'all' ? 'No tables match filters' : 'No tables configured'}</p>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">New Table</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Table Number *</label>
                <input value={newTable.table_number} onChange={e => setNewTable(f => ({ ...f, table_number: e.target.value }))} placeholder="e.g. 7" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Capacity *</label>
                <input type="number" value={newTable.capacity} onChange={e => setNewTable(f => ({ ...f, capacity: parseInt(e.target.value) || 4 }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Room / Section</label>
                <select value={newTable.room_id} onChange={e => setNewTable(f => ({ ...f, room_id: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— No room —</option>
                  {(rooms ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <input value={newTable.notes} onChange={e => setNewTable(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Near window" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={handleCreate} disabled={!newTable.table_number.trim() || !newTable.capacity} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Create Table
                </button>
                <button onClick={() => setShowCreate(false)} className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {disableConfirm && (
        <ConfirmDialog
          open={!!disableConfirm}
          onOpenChange={() => setDisableConfirm(null)}
          onConfirm={confirmDisable}
          title="Disable Table?"
          description={
            disableConfirm.hasActiveOrders
              ? `Table ${disableConfirm.table.table_number} has active orders. Disabling it will prevent new orders but existing orders remain.`
              : `Table ${disableConfirm.table.table_number} will be hidden from POS and order screens.`
          }
          consequence="The table stays in the database for historical records but won't be assignable to new orders."
          entity={`Table ${disableConfirm.table.table_number}`}
          confirmLabel="Disable"
          confirmVariant="destructive"
        />
      )}
    </div>
  );
}
