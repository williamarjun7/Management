import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/core/auth-context';
import { useNavigate } from 'react-router-dom';
import { useOrders, useTables, useKitchenOrders, useRooms, useRoomTypes, useCheckIn, useCheckOut, useUpdateRoomStatus } from '../../lib/hooks';
import { insforge } from '../../lib/core/insforge';
import { subscribeRooms } from '../../lib/services/realtime';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { showSuccess, showError } from '../../components/ui/toast';
import { RoomGrid } from '../../components/rooms/RoomGrid';
import { RoomList } from '../../components/rooms/RoomList';
import { RoomFilters, applyFilters } from '../../components/rooms/RoomFilters';
import { BookingForm } from '../motel/BookingForm';
import type { Order, RestaurantTable, Room, Booking } from '../../types';
import type { FiltersState } from '../../components/rooms/RoomFilters';
import { TABLE_STATUS_LABELS, TABLE_STATUS_COLORS, ORDER_STATUS_LABELS } from '../../types';
import {
  TrendingUp, ChevronRight, Users, CookingPot, Hotel,
  Receipt, ArrowRight, Timer, DollarSign
} from 'lucide-react';

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

const statStyles: Record<string, { border: string; iconBg: string; iconColor: string }> = {
  revenue: {
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  average: {
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  tables: {
    border: 'border-l-orange-500',
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  rooms: {
    border: 'border-l-violet-500',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
};

function StatCard({ icon: Icon, label, value, sublabel, variant }: {
  icon: React.ElementType; label: string; value: string; sublabel: string; variant: keyof typeof statStyles;
}) {
  const s = statStyles[variant];
  return (
    <div className={`group relative rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-l-4 ${s.border}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconBg} ${s.iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        {sublabel}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [roomViewMode, setRoomViewMode] = useState<'grid' | 'list'>('grid');
  const [activeSection, setActiveSection] = useState<'tables' | 'rooms'>('tables');
  const { data: orders } = useOrders();
  const { data: tables } = useTables();
  const { data: kitchenOrders } = useKitchenOrders();
  const { data: rooms, isLoading: roomsLoading } = useRooms();
  const { data: roomTypes } = useRoomTypes();
  const { data: bookings } = useQuery({
    queryKey: ['dashboard-active-bookings'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('bookings')
        .select('*, rooms(*, room_types(*))')
        .in('status', ['confirmed', 'checked_in'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
    staleTime: 30000,
  });
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const updateStatus = useUpdateRoomStatus();

  useEffect(() => {
    try {
      const unsub = subscribeRooms();
      return () => unsub();
    } catch {
      return undefined;
    }
  }, []);

  const [roomFilters, setRoomFilters] = useState<FiltersState>({ search: '', status: 'all', roomType: 'all' });
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'checkin' | 'checkout' | 'status';
    booking?: Booking;
    room?: Room;
    status?: string;
  } | null>(null);

  const { data: pendingInvoices } = useQuery({
    queryKey: ['pending-invoices'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('invoices')
        .select('*, orders!inner(id, order_number, status, restaurant_tables(table_number))')
        .in('status', ['unpaid', 'partial'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15000,
  });
  const activeOrders = (orders ?? []).filter(
    (o: Order) => o.status === 'active'
  );
  const recentOrders = (orders ?? []).slice(0, 8);
  const kitchenCount = (kitchenOrders ?? []).length;

  const netSales = (orders ?? []).reduce(
    (sum: number, o: Order) => sum + (o.status === 'completed' ? o.total : 0), 0
  );
  const avgCheck = activeOrders.length > 0
    ? activeOrders.reduce((sum: number, o: Order) => sum + o.total, 0) / activeOrders.length
    : 0;
  const occupiedTables = (tables ?? []).filter(
    (t: RestaurantTable) => t.status !== 'available'
  ).length;
  const totalTables = (tables ?? []).length;

  const occupiedRooms = (rooms ?? []).filter((r: Room) => r.status === 'occupied').length;
  const availableRooms = (rooms ?? []).filter((r: Room) => r.status === 'available').length;
  const totalRooms = (rooms ?? []).length;

  const filteredRooms = applyFilters(rooms ?? [], roomFilters);

  const handleTableClick = (table: RestaurantTable) => {
    navigate(`/pos?table=${table.id}`);
  };

  const executeCheckIn = useCallback(async () => {
    if (!confirmAction?.booking || !user) return;
    try {
      await checkIn.mutateAsync({
        p_booking_id: confirmAction.booking.id,
        p_user_id: user.id,
        p_idempotency_key: `checkin:${confirmAction.booking.id}:${Date.now()}`,
      });
      showSuccess(`${confirmAction.booking.guest_name} checked in successfully`);
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || 'Check-in failed');
    }
  }, [confirmAction, user, checkIn]);

  const executeCheckOut = useCallback(async () => {
    if (!confirmAction?.booking || !user) return;
    try {
      await checkOut.mutateAsync({
        p_booking_id: confirmAction.booking.id,
        p_user_id: user.id,
        p_idempotency_key: `checkout:${confirmAction.booking.id}:${Date.now()}`,
      });
      showSuccess(`${confirmAction.booking.guest_name} checked out successfully`);
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || 'Check-out failed');
    }
  }, [confirmAction, user, checkOut]);

  const executeStatusChange = useCallback(async () => {
    if (!confirmAction?.room) return;
    try {
      await updateStatus.mutateAsync({
        id: confirmAction.room.id,
        status: confirmAction.status || '',
        reason: `Dashboard quick action to ${confirmAction.status}`,
      });
      showSuccess(`Room ${confirmAction.room.room_number} marked as ${confirmAction.status}`);
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to update room status');
    }
  }, [confirmAction, updateStatus]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {user?.profile?.name ?? 'User'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{new Date().toLocaleDateString('ne-NP', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="NET SALES" value={`Rs. ${netSales.toFixed(0)}`} sublabel="Today's revenue" variant="revenue" />
          <StatCard icon={Receipt} label="AVERAGE CHECK" value={`Rs. ${avgCheck.toFixed(2)}`} sublabel="Per active order" variant="average" />
          <StatCard icon={Users} label="ACTIVE TABLES" value={`${occupiedTables} / ${totalTables}`} sublabel={`${totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% Occupied`} variant="tables" />
          <StatCard icon={Hotel} label="ROOM STATUS" value={`${occupiedRooms} / ${totalRooms}`} sublabel={`${availableRooms} Available`} variant="rooms" />
        </div>

        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md border-t-4 border-t-primary">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              Occupancy Trend
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2 h-28 px-1">
            {[
              { label: '08a', value: 40 },
              { label: '10a', value: 65 },
              { label: '12p', value: 95 },
              { label: '02p', value: 80 },
              { label: '04p', value: 50 },
              { label: '06p', value: 45 },
              { label: '08p', value: 60 },
            ].map((bar, i) => (
              <div key={i} className="relative flex flex-col items-center gap-1 flex-1 h-full justify-end">
                <div
                  className="w-full rounded-lg transition-all duration-500 hover:opacity-80"
                  style={{
                    height: `${bar.value}%`,
                    background: i === 2
                      ? 'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.6) 100%)'
                      : 'linear-gradient(180deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%)',
                  }}
                />
                <span className="text-[10px] font-medium text-muted-foreground">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 rounded-xl border bg-card p-6 transition-all duration-200 hover:shadow-md border-t-4 border-t-orange-500">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider ${activeSection === 'tables' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-muted text-muted-foreground'}`}>
                <Users className="h-3.5 w-3.5" />{activeSection === 'tables' ? 'Tables' : 'Tables'}
              </div>
              <div className="flex rounded-lg border p-0.5 bg-muted/50">
                <button
                  onClick={() => setActiveSection('tables')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${activeSection === 'tables' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Tables
                </button>
                <button
                  onClick={() => setActiveSection('rooms')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${activeSection === 'rooms' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Rooms
                </button>
              </div>
            </div>
            {activeSection === 'tables' && (
              <div className="flex gap-2 text-xs">
                <button onClick={() => setViewMode('grid')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${viewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Grid</button>
                <button onClick={() => setViewMode('list')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${viewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>List</button>
              </div>
            )}
            {activeSection === 'rooms' && (
              <div className="flex gap-2 text-xs">
                <button onClick={() => setRoomViewMode('grid')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${roomViewMode === 'grid' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Grid</button>
                <button onClick={() => setRoomViewMode('list')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${roomViewMode === 'list' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>List</button>
              </div>
            )}
          </div>

          {activeSection === 'tables' && (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-4">
                  {(tables ?? []).length === 0 && (
                    <>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center gap-2">
                          <div className="w-full aspect-square rounded-2xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-0.5 bg-muted/30">
                            <span className="text-sm font-bold text-muted-foreground/40">Table {i + 1}</span>
                          </div>
                          <div className="h-5 w-16 rounded-full bg-muted-foreground/10 animate-pulse" />
                        </div>
                      ))}
                    </>
                  )}
                  {(tables ?? []).map((table: RestaurantTable) => {
                    const isOccupied = table.status !== 'available';
                    const isReserved = table.status === 'reserved';
                    return (
                      <div
                        key={table.id}
                        onClick={() => handleTableClick(table)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTableClick(table); } }}
                        role="button"
                        tabIndex={0}
                        className="flex flex-col items-center gap-2 group cursor-pointer"
                      >
                        <div className={`relative w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 ${
                          isOccupied
                            ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                            : isReserved
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-muted-foreground/20 bg-card hover:border-orange-300'
                        }`}>
                          <span className={`text-lg font-extrabold leading-none ${isOccupied ? 'text-orange-700 dark:text-orange-300' : isReserved ? 'text-blue-700 dark:text-blue-300' : 'text-foreground group-hover:text-orange-500 transition-colors'}`}>
                            {table.table_number}
                          </span>
                          {isOccupied && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500/40 opacity-75" />
                              <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 border-2 border-white dark:border-gray-900" />
                            </span>
                          )}
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${
                          isOccupied ? 'bg-orange-100 dark:bg-orange-900/30' : isReserved ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${TABLE_STATUS_COLORS[table.status] || 'bg-gray-400'}`} />
                          <span className={`text-[11px] font-medium ${
                            isOccupied ? 'text-orange-700 dark:text-orange-300' : isReserved ? 'text-blue-700 dark:text-blue-300' : 'text-muted-foreground'
                          }`}>
                            {TABLE_STATUS_LABELS[table.status] || table.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {(tables ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No tables available</p>
                  )}
                  {(tables ?? []).map((table: RestaurantTable) => (
                    <div
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTableClick(table); } }}
                      role="button"
                      tabIndex={0}
                      className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-orange-50 hover:border-orange-200 dark:hover:bg-orange-950/10 dark:hover:border-orange-900/30 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${TABLE_STATUS_COLORS[table.status] || 'bg-gray-400'}`} />
                        <div>
                          <span className="text-sm font-medium">Table {table.table_number}</span>
                          <span className="text-xs text-muted-foreground ml-2">{TABLE_STATUS_LABELS[table.status] || table.status}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeSection === 'rooms' && (
            <div className="space-y-4">
              <RoomFilters
                filters={roomFilters}
                onChange={setRoomFilters}
                roomTypes={roomTypes}
              />

              {roomsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                </div>
              ) : roomViewMode === 'grid' ? (
                <RoomGrid
                  rooms={filteredRooms}
                  bookings={bookings}
                  onCheckIn={(booking) => setConfirmAction({ type: 'checkin', booking })}
                  onCheckOut={(booking) => setConfirmAction({ type: 'checkout', booking })}
                  onCreateBooking={(room) => { setBookingRoom(room); setShowBookingForm(true); }}
                  onMarkCleaning={(room) => setConfirmAction({ type: 'status', room, status: 'cleaning' })}
                  onMarkMaintenance={(room) => setConfirmAction({ type: 'status', room, status: 'maintenance' })}
                />
              ) : (
                <RoomList
                  rooms={filteredRooms}
                  bookings={bookings}
                  onCheckIn={(booking) => setConfirmAction({ type: 'checkin', booking })}
                  onCheckOut={(booking) => setConfirmAction({ type: 'checkout', booking })}
                  onCreateBooking={(room) => { setBookingRoom(room); setShowBookingForm(true); }}
                  onMarkCleaning={(room) => setConfirmAction({ type: 'status', room, status: 'cleaning' })}
                  onMarkMaintenance={(room) => setConfirmAction({ type: 'status', room, status: 'maintenance' })}
                />
              )}
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-6 transition-all duration-200 hover:shadow-md border-t-4 border-t-orange-500">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <CookingPot className="h-4 w-4 text-orange-500" />
              Kitchen Queue
            </h3>
            <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/40">
              {kitchenCount} Active
            </Badge>
          </div>
          <div className="space-y-3">
            {kitchenCount === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No active orders in kitchen</p>
            )}
            {(kitchenOrders ?? []).slice(0, 5).map((order: Order) => (
              <div key={order.id} className="relative flex items-start gap-3 rounded-lg bg-orange-50/50 dark:bg-orange-950/10 p-3 border border-orange-100 dark:border-orange-900/20 transition-all hover:bg-orange-100/50 dark:hover:bg-orange-950/20 hover:border-orange-200 dark:hover:border-orange-800/30">
                <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xs font-bold shrink-0">
                  {Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)}'
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    Order #{order.order_number?.slice(-3) || order.id.slice(0, 6)} - {order.restaurant_tables?.table_number ? `Table ${order.restaurant_tables.table_number}` : 'Takeaway'}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {(order.order_items ?? []).map((i: { item_name: string }) => i.item_name).join(', ')}
                  </p>
                </div>
                <div className="shrink-0">
                  <Badge variant="default" className="text-[10px] bg-orange-500 hover:bg-orange-600">
                    {order.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          {kitchenCount > 5 && (
            <button
              onClick={() => navigate('/kitchen')}
              className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 py-2 transition-colors font-medium"
            >
              View all {kitchenCount} orders <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6 transition-all duration-200 hover:shadow-md border-l-4 border-l-amber-500">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-500" />
            Pending Payments
          </h3>
          {!pendingInvoices || pendingInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending payments</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Table</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Duration</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvoices.map((inv: any) => (
                  <TableRow key={inv.id} className="hover:bg-amber-50/50 dark:hover:bg-amber-950/10 transition-colors">
                    <TableCell className="font-medium">
                      {inv.orders?.restaurant_tables ? `Table ${inv.orders.restaurant_tables.table_number}` : 'Takeaway'}
                    </TableCell>
                    <TableCell className="font-semibold text-amber-600 dark:text-amber-400">Rs. {Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDuration(Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 60000))}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => navigate(`/billing/${inv.id}`)}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-600 transition-all active:scale-95 shadow-sm"
                      >
                        Process <ArrowRight className="h-3 w-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6 transition-all duration-200 hover:shadow-md border-l-4 border-l-blue-500">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Recent Activity
          </h3>
          <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-blue-200 dark:before:bg-blue-900/30">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 pl-8">No recent activity</p>
            ) : (
              recentOrders.map((order: Order) => (
                <div key={order.id} className="relative pl-8 group">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white dark:bg-gray-900 border-2 border-blue-300 dark:border-blue-700 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      {order.status === 'completed' ? 'Rs.' : '#'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {order.status === 'completed' ? 'Payment Completed' :
                       `Order ${ORDER_STATUS_LABELS[order.status] || order.status}`} - {order.restaurant_tables ? `Table ${order.restaurant_tables.table_number}` : 'Takeaway'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)}m ago
                      {order.total ? ` • Rs. ${order.total.toFixed(2)}` : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showBookingForm && (
        <BookingForm
          preselectedRoomId={bookingRoom?.id}
          onClose={() => { setShowBookingForm(false); setBookingRoom(null); }}
        />
      )}

      <ConfirmDialog
        open={confirmAction?.type === 'checkin'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title="Confirm Check-In"
        description={`Check in ${confirmAction?.booking?.guest_name} to Room ${confirmAction?.booking?.rooms?.room_number}?`}
        consequence="Room will be marked occupied. Guest stay tracking begins."
        entity={`${confirmAction?.booking?.booking_number ?? ''} — ${confirmAction?.booking?.guest_name ?? ''}`}
        confirmLabel="Yes, Check In"
        onConfirm={executeCheckIn}
        isPending={checkIn.isPending}
      />

      <ConfirmDialog
        open={confirmAction?.type === 'checkout'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title="Confirm Check-Out"
        description={`Check out ${confirmAction?.booking?.guest_name} from Room ${confirmAction?.booking?.rooms?.room_number}?`}
        consequence="An invoice will be generated for all outstanding charges. Room will be marked for cleaning."
        entity={`${confirmAction?.booking?.booking_number ?? ''} — ${confirmAction?.booking?.guest_name ?? ''}`}
        confirmLabel="Yes, Check Out"
        confirmVariant="destructive"
        onConfirm={executeCheckOut}
        isPending={checkOut.isPending}
      />

      <ConfirmDialog
        open={confirmAction?.type === 'status'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title="Change Room Status"
        description={`Change Room ${confirmAction?.room?.room_number} status to "${confirmAction?.status}"?`}
        consequence="This will update the room availability and be logged in state transitions."
        entity={`Room ${confirmAction?.room?.room_number ?? ''}`}
        confirmLabel="Change Status"
        onConfirm={executeStatusChange}
        isPending={updateStatus.isPending}
      />
    </div>
  );
}
