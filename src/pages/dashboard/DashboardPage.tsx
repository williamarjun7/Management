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
import { TABLE_STATUS_LABELS, TABLE_STATUS_COLORS } from '../../types';
import { TrendingUp, Clock, User, ChevronRight, Users, CookingPot, Hotel, Building2 } from 'lucide-react';

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

  const activeOrders = (orders ?? []).filter(
    (o: Order) => !['completed', 'cancelled', 'refunded'].includes(o.status)
  );
  const pendingPayments = (orders ?? []).filter(
    (o: Order) => o.status === 'ready' || o.status === 'served'
  );
  const recentOrders = (orders ?? []).slice(0, 8);
  const kitchenCount = (kitchenOrders ?? []).length;

  const netSales = (orders ?? []).reduce(
    (sum: number, o: Order) => sum + (['completed', 'served'].includes(o.status) ? o.total : 0), 0
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {user?.profile?.name ?? 'User'}</h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('ne-NP', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Net Sales</span>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-end justify-between mt-2">
              <span className="text-3xl font-bold tracking-tight">Rs. {netSales.toFixed(0)}</span>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Today
              </span>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Average Check</span>
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-end justify-between mt-2">
              <span className="text-3xl font-bold tracking-tight">Rs. {avgCheck.toFixed(2)}</span>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Active
              </span>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 flex flex-col justify-between border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Active Tables</span>
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-end justify-between mt-2">
              <span className="text-3xl font-bold tracking-tight">{occupiedTables} / {totalTables}</span>
              <span className="text-xs text-muted-foreground">
                {totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% Occ.
              </span>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 flex flex-col justify-between border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Room Status</span>
              <Hotel className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-end justify-between mt-2">
              <span className="text-3xl font-bold tracking-tight">{occupiedRooms} / {totalRooms}</span>
              <span className="text-xs text-muted-foreground">
                {availableRooms} Available
              </span>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Occupancy Trend</h3>
          </div>
          <div className="h-24 flex items-end justify-between gap-2 px-1">
            {[40, 65, 95, 80, 50, 45, 60].map((h, i) => (
              <div
                key={i}
                className="w-full rounded-t"
                style={{
                  height: `${h}%`,
                  backgroundColor: i === 2 ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground uppercase font-semibold px-1">
            <span>08a</span><span>10a</span><span>12p</span><span>02p</span><span>04p</span><span>06p</span><span>08p</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex rounded-lg border p-0.5 bg-muted/50">
                <button
                  onClick={() => setActiveSection('tables')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${activeSection === 'tables' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Users className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />Tables
                </button>
                <button
                  onClick={() => setActiveSection('rooms')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${activeSection === 'rooms' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Building2 className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />Rooms
                </button>
              </div>
            </div>
            {activeSection === 'tables' && (
              <div className="flex gap-2 text-xs">
                <button onClick={() => setViewMode('grid')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Grid</button>
                <button onClick={() => setViewMode('list')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>List</button>
              </div>
            )}
            {activeSection === 'rooms' && (
              <div className="flex gap-2 text-xs">
                <button onClick={() => setRoomViewMode('grid')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer ${roomViewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Grid</button>
                <button onClick={() => setRoomViewMode('list')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer ${roomViewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>List</button>
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
                            <span className="text-sm font-bold text-muted-foreground/40">T{i + 1}</span>
                            <Users className="h-3 w-3 text-muted-foreground/30" />
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
                        className="flex flex-col items-center gap-2 group cursor-pointer"
                      >
                        <div className={`relative w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 ${
                          isOccupied
                            ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                            : isReserved
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-muted-foreground/20 bg-card hover:border-muted-foreground/40'
                        }`}>
                          <span className={`text-lg font-extrabold leading-none ${isOccupied ? 'text-orange-700 dark:text-orange-300' : isReserved ? 'text-blue-700 dark:text-blue-300' : 'text-foreground group-hover:text-primary transition-colors'}`}>
                            T{table.table_number}
                          </span>
                          <Users className={`h-3 w-3 ${isOccupied ? 'text-orange-500/60' : isReserved ? 'text-blue-500/60' : 'text-muted-foreground/40'}`} />
                          <span className={`text-[10px] font-medium leading-none ${isOccupied ? 'text-orange-600/80' : isReserved ? 'text-blue-600/80' : 'text-muted-foreground/50'}`}>
                            {table.capacity}pax
                          </span>
                          {isOccupied && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
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
                      className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${TABLE_STATUS_COLORS[table.status] || 'bg-gray-400'}`} />
                        <div>
                          <span className="text-sm font-medium">Table {table.table_number}</span>
                          <span className="text-xs text-muted-foreground ml-2">{TABLE_STATUS_LABELS[table.status] || table.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{table.capacity}pax</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
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
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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

        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Kitchen Queue</h3>
            <Badge variant="secondary" className="text-xs">
              <CookingPot className="h-3 w-3 mr-1" />
              {kitchenCount} Active
            </Badge>
          </div>
          <div className="space-y-3">
            {kitchenCount === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No active orders in kitchen</p>
            )}
            {(kitchenOrders ?? []).slice(0, 5).map((order: Order) => (
              <div key={order.id} className="flex items-start gap-3 rounded-lg bg-muted p-3">
                <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 text-xs font-bold shrink-0">
                  {Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)}'
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    Order #{order.order_number?.slice(-3) || order.id.slice(0, 6)} - {order.restaurant_tables?.table_number ? `T${order.restaurant_tables.table_number}` : 'Takeaway'}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {(order.order_items ?? []).map((i: { item_name: string }) => i.item_name).join(', ')}
                  </p>
                </div>
                <div className="ml-auto shrink-0">
                  <Badge variant={order.status === 'preparing' ? 'default' : 'secondary'} className="text-[10px]">
                    {order.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          {kitchenCount > 5 && (
            <button
              onClick={() => navigate('/kitchen')}
              className="w-full mt-3 text-xs text-center text-muted-foreground hover:text-foreground py-2"
            >
              View all {kitchenCount} orders →
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6">
          <h3 className="text-base font-semibold mb-4">Pending Payments</h3>
          {pendingPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending payments</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.map((order: Order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.restaurant_tables ? `T${order.restaurant_tables.table_number}` : 'Takeaway'}
                    </TableCell>
                    <TableCell className="font-semibold">Rs. {order.total.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)}m
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => navigate(`/billing`)}
                        className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-xs font-medium"
                      >
                        Process
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6">
          <h3 className="text-base font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 pl-8">No recent activity</p>
            ) : (
              recentOrders.map((order: Order) => (
                <div key={order.id} className="relative pl-8">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-background border-2 border-border flex items-center justify-center">
                    <span className="text-[10px] font-bold text-foreground">
                      {order.status === 'completed' ? 'Rs.' : order.status === 'confirmed' ? '+' : '#'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {order.status === 'completed' ? 'Payment Completed' :
                       order.status === 'confirmed' ? 'Order Confirmed' :
                       `Order ${order.status}`} - {order.restaurant_tables ? `T${order.restaurant_tables.table_number}` : 'Takeaway'}
                    </p>
                    <p className="text-xs text-muted-foreground">
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
