import { useState } from 'react';
import { useDiningRooms, useCreateDiningRoom, useUpdateDiningRoom } from '../../lib/hooks';
import { insforge } from '../../lib/core/insforge';
import { showSuccess, showError } from '../../components/ui/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Plus, Search, Settings2, EyeOff, Eye, Save, X, Loader2 } from 'lucide-react';

export default function DiningRoomsPage() {
  const { data: rooms, isLoading } = useDiningRooms();
  const createRoom = useCreateDiningRoom();
  const updateRoom = useUpdateDiningRoom();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; display_order: number }>({ name: '', description: '', display_order: 0 });
  const [newRoom, setNewRoom] = useState<{ name: string; description: string; display_order: number }>({ name: '', description: '', display_order: 0 });
  const [disableConfirm, setDisableConfirm] = useState<{ id: string; name: string; tableCount: number } | null>(null);
  const [roomTableCounts, setRoomTableCounts] = useState<Record<string, number>>({});

  const fetchTableCounts = async () => {
    const { data } = await insforge.database
      .from('restaurant_tables')
      .select('room_id')
      .is('deleted_at', null);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((t: { room_id: string | null }) => {
      if (t.room_id) counts[t.room_id] = (counts[t.room_id] || 0) + 1;
    });
    setRoomTableCounts(counts);
  };

  useState(() => { fetchTableCounts(); });

  const filtered = (rooms ?? []).filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newRoom.name.trim()) return;
    try {
      await createRoom.mutateAsync(newRoom);
      setShowCreate(false);
      setNewRoom({ name: '', description: '', display_order: 0 });
      showSuccess('Room created');
    } catch { showError('Failed to create room'); }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateRoom.mutateAsync({ id, ...editForm });
      setEditingId(null);
      showSuccess('Room updated');
    } catch { showError('Failed to update room'); }
  };

  const handleToggleEnabled = async (room: { id: string; name: string; is_enabled: boolean }) => {
    if (room.is_enabled) {
      const tableCount = roomTableCounts[room.id] ?? 0;
      if (tableCount > 0) {
        const { data: activeOrders } = await insforge.database
          .from('orders')
          .select('id')
          .in('table_id', (await insforge.database.from('restaurant_tables').select('id').eq('room_id', room.id)).data?.map(t => t.id) ?? [])
          .not('status', 'in', '("cancelled","refunded")');
        if (activeOrders && activeOrders.length > 0) {
          setDisableConfirm({ id: room.id, name: room.name, tableCount });
          return;
        }
      }
    }
    try {
      await updateRoom.mutateAsync({ id: room.id, is_enabled: !room.is_enabled });
      showSuccess(room.is_enabled ? 'Room disabled' : 'Room enabled');
    } catch { showError('Failed to update room'); }
  };

  const confirmDisable = async () => {
    if (!disableConfirm) return;
    try {
      await updateRoom.mutateAsync({ id: disableConfirm.id, is_enabled: false });
      setDisableConfirm(null);
      showSuccess('Room disabled');
    } catch { showError('Failed to disable room'); }
  };

  const startEdit = (room: { id: string; name: string; description: string | null; display_order: number }) => {
    setEditingId(room.id);
    setEditForm({ name: room.name, description: room.description ?? '', display_order: room.display_order });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dining Rooms & Sections</h1>
          <p className="text-sm text-muted-foreground">Manage restaurant dining areas</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Room
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search rooms..."
          className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((room) => (
          <div key={room.id} className={`rounded-xl border bg-card overflow-hidden transition-colors ${!room.is_enabled ? 'opacity-60 border-dashed' : ''}`}>
            {editingId === room.id ? (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Display Order</label>
                    <input type="number" value={editForm.display_order} onChange={e => setEditForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleUpdate(room.id)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${room.is_enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {room.is_enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{room.name}</h3>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${room.is_enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                          {room.is_enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      {room.description && (
                        <p className="text-xs text-muted-foreground">{room.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{roomTableCounts[room.id] ?? 0} tables</p>
                      <p className="text-xs text-muted-foreground">Order {room.display_order}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(room)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <Settings2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleToggleEnabled(room)} className={`p-2 rounded-lg hover:bg-accent transition-colors ${room.is_enabled ? 'text-muted-foreground hover:text-destructive' : 'text-muted-foreground hover:text-emerald-500'}`}>
                        {room.is_enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
            <p className="text-muted-foreground">{search ? 'No rooms match search' : 'No rooms configured'}</p>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">New Dining Room</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <input value={newRoom.name} onChange={e => setNewRoom(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Hall" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <input value={newRoom.description} onChange={e => setNewRoom(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Main dining area" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Display Order</label>
                <input type="number" value={newRoom.display_order} onChange={e => setNewRoom(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={handleCreate} disabled={!newRoom.name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Create Room
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
          title="Disable Room?"
          description="This room has tables assigned to it. Disabling will hide all its tables from staff."
          consequence="This room will no longer appear in POS, ordering, or table selection screens."
          entity={disableConfirm.name}
          confirmLabel="Disable"
          confirmVariant="destructive"
        />
      )}
    </div>
  );
}
