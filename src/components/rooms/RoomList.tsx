import { ChevronRight, LogIn, LogOut, CalendarCheck, Paintbrush, Wrench } from 'lucide-react';
import type { Room, Booking } from '../../types';
import { Badge } from '../../components/ui/badge';
import { ROOM_STATUS_STYLES, getActiveBooking } from './room.utils';

interface RoomListProps {
  rooms: Room[];
  bookings?: Booking[];
  isLoading?: boolean;
  onView?: (room: Room) => void;
  onCheckIn?: (booking: Booking) => void;
  onCheckOut?: (booking: Booking) => void;
  onCreateBooking?: (room: Room) => void;
  onMarkCleaning?: (room: Room) => void;
  onMarkMaintenance?: (room: Room) => void;
}

export function RoomList({ rooms, bookings, isLoading, onView, onCheckIn, onCheckOut, onCreateBooking, onMarkCleaning, onMarkMaintenance }: RoomListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-muted animate-pulse rounded w-1/4" />
              <div className="h-3 bg-muted animate-pulse rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No rooms found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rooms.map((room: Room) => {
        const style = ROOM_STATUS_STYLES[room.status] ?? ROOM_STATUS_STYLES.available;
        const activeBooking = getActiveBooking(room.id, bookings);

        return (
          <div key={room.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-accent/50 transition-colors group">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Room {room.room_number}</span>
                  <span className="text-xs text-muted-foreground">{room.room_types?.name}</span>
                </div>
                {activeBooking && (
                  <span className="text-xs text-muted-foreground">{activeBooking.guest_name}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={style.badge} className="text-[10px] hidden sm:inline-flex">{style.label}</Badge>

              {room.status === 'available' && onCreateBooking && (
                <button type="button" onClick={() => onCreateBooking(room)} className="rounded p-1.5 text-primary hover:bg-accent transition-colors" title="Create Booking">
                  <CalendarCheck className="h-4 w-4" />
                </button>
              )}
              {room.status === 'occupied' && activeBooking && onCheckOut && (
                <button type="button" onClick={() => onCheckOut(activeBooking)} className="rounded p-1.5 text-orange-600 hover:bg-accent transition-colors" title="Check Out">
                  <LogOut className="h-4 w-4" />
                </button>
              )}
              {(room.status === 'reserved' || room.status === 'booked') && activeBooking && onCheckIn && (
                <button type="button" onClick={() => onCheckIn(activeBooking)} className="rounded p-1.5 text-primary hover:bg-accent transition-colors" title="Check In">
                  <LogIn className="h-4 w-4" />
                </button>
              )}
              {room.status !== 'cleaning' && onMarkCleaning && (
                <button type="button" onClick={() => onMarkCleaning(room)} className="rounded p-1.5 text-muted-foreground hover:bg-accent transition-colors" title="Mark Cleaning">
                  <Paintbrush className="h-4 w-4" />
                </button>
              )}
              {room.status !== 'maintenance' && onMarkMaintenance && (
                <button type="button" onClick={() => onMarkMaintenance(room)} className="rounded p-1.5 text-muted-foreground hover:bg-accent transition-colors" title="Mark Maintenance">
                  <Wrench className="h-4 w-4" />
                </button>
              )}
              {onView && (
                <button type="button" onClick={() => onView(room)} className="rounded p-1.5 text-muted-foreground hover:bg-accent transition-colors" title="View Details">
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
