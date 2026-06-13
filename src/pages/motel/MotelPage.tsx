import { useState, useCallback, useEffect } from "react";
import { Hotel, CalendarCheck, LogIn, LogOut, Plus, Trash2, Search, DoorOpen, Activity } from "lucide-react";
import { useRooms, useRoomTypes, useTodayBookings, useCheckIn, useCheckOut, useDeleteBooking, useUpdateRoomStatus } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { pushStatusUpdateToWebsite, getExternalBookingByPosId } from "../../lib/services/booking-sync";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { BookingForm } from "./BookingForm";
import RoomDialog from "./RoomDialog";
import { SyncAdminPanel } from "../../components/SyncAdminPanel";
import { subscribeRooms } from "../../lib/services/realtime";
import type { Room, RoomType, Booking } from "../../types";

const statusLabel: Record<string, string> = {
  available: "Available", reserved: "Booked", booked: "Booked",
  occupied: "Occupied", partial_paid: "Partial Paid", fully_paid: "Fully Paid",
  cleaning: "Cleaning", maintenance: "Maintenance",
};

export default function MotelPage() {
  const { user } = useAuth();
  const { data: rooms, isLoading: roomsLoading, refetch: refetchRooms } = useRooms();
  const { data: roomTypes } = useRoomTypes();
  const { data: todayBookings, refetch: refetchTodayBookings } = useTodayBookings();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const deleteBooking = useDeleteBooking();
  const updateStatus = useUpdateRoomStatus();

  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeRooms(() => {
      refetchRooms();
      refetchTodayBookings();
    });
    return unsubscribe;
  }, []);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "checkin" | "checkout";
    booking: Booking;
  } | null>(null);
  const [confirmDeleteBooking, setConfirmDeleteBooking] = useState<Booking | null>(null);
  const [confirmStatusTarget, setConfirmStatusTarget] = useState<{
    room: Room;
    status: string;
  } | null>(null);

  const filteredRooms = (filterType === "all"
    ? rooms
    : rooms?.filter((r: Room) => r.room_type_id === filterType))
    ?.filter((r: Room) =>
      !searchQuery || r.room_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const occupiedCount = rooms?.filter((r: Room) => r.status === "occupied").length ?? 0;
  const availableCount = rooms?.filter((r: Room) => r.status === "available").length ?? 0;
  const bookedCount = rooms?.filter((r: Room) => r.status === "reserved" || r.status === "booked").length ?? 0;
  const cleaningCount = rooms?.filter((r: Room) => r.status === "cleaning").length ?? 0;

  const checkedInToday = todayBookings?.filter(
    (b) => b.status === "checked_in"
  ).length ?? 0;

  const syncStatusToWebsite = useCallback(async (bookingId: string, eventType: string) => {
    try {
      const ext = await getExternalBookingByPosId(bookingId);
      if (!ext?.external_booking_id) return;
      const idempotencyKey = crypto.randomUUID();
      await pushStatusUpdateToWebsite({
        external_booking_id: ext.external_booking_id,
        event_type: eventType,
        idempotency_key: idempotencyKey,
      });
    } catch (err) {
      console.error('Failed to sync status to website:', err);
    }
  }, []);

  const handleCheckIn = useCallback((booking: Booking) => {
    setConfirmAction({ type: "checkin", booking });
  }, []);

  const handleCheckOut = useCallback((booking: Booking) => {
    setConfirmAction({ type: "checkout", booking });
  }, []);

  const executeCheckIn = useCallback(async () => {
    if (!confirmAction || !user) return;
    try {
      await checkIn.mutateAsync({
        p_booking_id: confirmAction.booking.id,
        p_user_id: user.id,
        p_idempotency_key: `checkin:${confirmAction.booking.id}:${Date.now()}`,
      });
      showSuccess(`${confirmAction.booking.guest_name} checked in successfully`);
      syncStatusToWebsite(confirmAction.booking.id, 'booking.checked_in');
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || "Check-in failed");
    }
  }, [confirmAction, user, checkIn, syncStatusToWebsite]);

  const executeCheckOut = useCallback(async () => {
    if (!confirmAction || !user) return;
    try {
      await checkOut.mutateAsync({
        p_booking_id: confirmAction.booking.id,
        p_user_id: user.id,
        p_idempotency_key: `checkout:${confirmAction.booking.id}:${Date.now()}`,
      });
      showSuccess(`${confirmAction.booking.guest_name} checked out successfully`);
      syncStatusToWebsite(confirmAction.booking.id, 'booking.checked_out');
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || "Check-out failed");
    }
  }, [confirmAction, user, checkOut, syncStatusToWebsite]);

  const handleBookingClick = () => {
    setShowBookingForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Room Management</h1>
          <p className="text-muted-foreground">Manage rooms, bookings, and operations.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowRoomDialog(true)} variant="outline" className="min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" /> Add Room
          </Button>
          <Button onClick={() => setShowBookingForm(true)} className="min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" /> New Booking
          </Button>
          <Button onClick={() => setShowSyncPanel(!showSyncPanel)} variant="ghost" className="min-h-[44px]">
            <Activity className="mr-2 h-4 w-4" /> Sync
          </Button>
        </div>
      </div>

      {showSyncPanel && (
        <SyncAdminPanel />
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <Hotel className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{availableCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupied</CardTitle>
            <Hotel className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{occupiedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booked</CardTitle>
            <Hotel className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{bookedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cleaning</CardTitle>
            <Hotel className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{cleaningCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In Today</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkedInToday}</div>
          </CardContent>
        </Card>
      </div>

      {todayBookings && todayBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4" /> Today's Bookings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Booking</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Guest</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Room</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Arrival</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {todayBookings.map((booking) => (
                    <tr key={booking.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">{booking.booking_number}</td>
                      <td className="px-4 py-3 text-sm">{booking.guest_name}</td>
                      <td className="px-4 py-3 text-sm">{booking.rooms?.room_number}</td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(booking.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          booking.status === "checked_in" ? "default" :
                          booking.status === "confirmed" ? "secondary" : "outline"
                        }>
                          {booking.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {booking.status === "confirmed" && (
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleCheckIn(booking); }} disabled={checkIn.isPending} className="min-h-[44px]">
                              <LogIn className="mr-1 h-3 w-3" /> Check In
                            </Button>
                          )}
                          {booking.status === "checked_in" && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleCheckOut(booking); }} disabled={checkOut.isPending} className="min-h-[44px]">
                              <LogOut className="mr-1 h-3 w-3" /> Check Out
                            </Button>
                          )}
                          {booking.status !== "checked_in" && booking.status !== "checked_out" && (
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteBooking(booking); }} className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors" title="Cancel booking">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search rooms..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <Tabs value={filterType} onValueChange={setFilterType} className="flex-1">
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All Rooms</TabsTrigger>
            {roomTypes?.map((rt: RoomType) => (
              <TabsTrigger key={rt.id} value={rt.id}>{rt.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div>
        {roomsLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredRooms?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <DoorOpen className="mb-3 h-12 w-12" />
            <p className="text-sm">No rooms found</p>
            <Button variant="outline" size="sm" onClick={() => setShowRoomDialog(true)} className="mt-3">
              <Plus className="mr-1 h-3 w-3" /> Add a Room
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredRooms?.map((room: Room) => (
              <div key={room.id} className={`flex flex-col rounded-lg border-2 transition-colors ${
                room.status === 'available' ? 'border-emerald-200 bg-emerald-50/30' :
                room.status === 'occupied' ? 'border-red-200 bg-red-50/30' :
                room.status === 'reserved' || room.status === 'booked' ? 'border-yellow-200 bg-yellow-50/30' :
                room.status === 'cleaning' ? 'border-orange-200 bg-orange-50/30' :
                room.status === 'maintenance' ? 'border-gray-200 bg-gray-50/30' :
                'border-border bg-card'
              }`}>
                <div className="flex flex-col items-center p-4">
                  <span className="text-lg font-bold">{room.room_number}</span>
                  <span className="mt-0.5 text-xs text-muted-foreground">{room.room_types?.name}</span>
                  <Badge variant={
                    room.status === "available" ? "success" :
                    room.status === "occupied" ? "destructive" :
                    room.status === "reserved" || room.status === "booked" ? "warning" : "outline"
                  } className="mt-2 text-[10px] uppercase tracking-wider">
                    {statusLabel[room.status] || room.status}
                  </Badge>
                </div>
                <div className="flex border-t border-inherit divide-x divide-inherit">
                  {room.status === "available" && (
                    <button type="button" onClick={handleBookingClick} className="flex-1 py-1.5 text-[11px] font-medium text-center hover:bg-black/5 transition-colors">
                      Book Now
                    </button>
                  )}
                  {room.status === "occupied" && (
                    <button type="button" className="flex-1 py-1.5 text-[11px] font-medium text-center hover:bg-black/5 transition-colors text-muted-foreground">
                      Occupied
                    </button>
                  )}
                  <button type="button" onClick={() => setEditingRoom(room)} className="flex-1 py-1.5 text-[11px] font-medium text-center hover:bg-black/5 transition-colors">
                    Edit
                  </button>
                  <button type="button" onClick={() => {
                    const nextStatus = room.status === "available" ? "maintenance"
                      : room.status === "occupied" ? "cleaning"
                      : room.status === "cleaning" ? "available"
                      : "available";
                    setConfirmStatusTarget({ room, status: nextStatus });
                  }} className="flex-1 py-1.5 text-[11px] font-medium text-center hover:bg-black/5 transition-colors">
                    {room.status === "available" ? "Maint." :
                     room.status === "occupied" ? "Cleaning" :
                     room.status === "cleaning" ? "Ready" : "Status"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showRoomDialog || editingRoom) && (
        <RoomDialog open={true} room={editingRoom} onClose={() => { setShowRoomDialog(false); setEditingRoom(null); }} />
      )}

      {showBookingForm && (
        <BookingForm onClose={() => setShowBookingForm(false)} />
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={confirmAction?.type === "checkin" ? "Confirm Check-In" : "Confirm Check-Out"}
        description={
          confirmAction?.type === "checkin"
            ? `Check in ${confirmAction?.booking.guest_name} to Room ${confirmAction?.booking.rooms?.room_number}?`
            : `Check out ${confirmAction?.booking.guest_name} from Room ${confirmAction?.booking.rooms?.room_number}?`
        }
        consequence={
          confirmAction?.type === "checkin"
            ? "Room will be marked occupied. Guest stay tracking begins."
            : "An invoice will be generated for all outstanding charges. Room will be marked for cleaning."
        }
        entity={`${confirmAction?.booking.booking_number ?? ""} — ${confirmAction?.booking.guest_name ?? ""}`}
        confirmLabel={confirmAction?.type === "checkin" ? "Yes, Check In" : "Yes, Check Out"}
        confirmVariant={confirmAction?.type === "checkout" ? "destructive" : "default"}
        onConfirm={confirmAction?.type === "checkin" ? executeCheckIn : executeCheckOut}
        isPending={checkIn.isPending || checkOut.isPending}
      />

      <ConfirmDialog
        open={confirmDeleteBooking !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteBooking(null); }}
        title="Cancel Booking"
        description={`Cancel booking for ${confirmDeleteBooking?.guest_name} (Room ${confirmDeleteBooking?.rooms?.room_number})?`}
        consequence="The booking will be cancelled and the room will be released."
        entity={`Booking: ${confirmDeleteBooking?.booking_number ?? ""} — ${confirmDeleteBooking?.guest_name ?? ""}`}
        confirmLabel="Cancel Booking"
        onConfirm={() => {
          if (!confirmDeleteBooking) return;
          deleteBooking.mutate(confirmDeleteBooking.id, {
            onSuccess: () => {
              showSuccess(`Booking ${confirmDeleteBooking.booking_number} cancelled`);
              syncStatusToWebsite(confirmDeleteBooking.id, 'booking.cancelled');
              setConfirmDeleteBooking(null);
            },
            onError: (err) => showError((err as Error)?.message || "Failed to cancel booking"),
          });
        }}
        isPending={deleteBooking.isPending}
      />

      <ConfirmDialog
        open={confirmStatusTarget !== null}
        onOpenChange={(open) => { if (!open) setConfirmStatusTarget(null); }}
        title="Change Room Status"
        description={`Change Room ${confirmStatusTarget?.room.room_number} status to "${confirmStatusTarget?.status}"?`}
        consequence="This will update the room availability and be logged in state transitions."
        entity={`Room ${confirmStatusTarget?.room.room_number ?? ""}`}
        confirmLabel="Change Status"
        onConfirm={() => {
          if (!confirmStatusTarget) return;
          updateStatus.mutate(
            { id: confirmStatusTarget.room.id, status: confirmStatusTarget.status, reason: `Quick status change to ${confirmStatusTarget.status}` },
            {
              onSuccess: () => {
                showSuccess(`Room ${confirmStatusTarget.room.room_number} marked as ${confirmStatusTarget.status}`);
                setConfirmStatusTarget(null);
              },
              onError: (err) => showError((err as Error)?.message || "Failed to update room status"),
            }
          );
        }}
        isPending={updateStatus.isPending}
      />
    </div>
  );
}
