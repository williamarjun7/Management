import { LogIn, LogOut, Paintbrush, Wrench, CalendarCheck } from 'lucide-react';
import type { Room, Booking } from '../../types';
import { Badge } from '../../components/ui/badge';
import { ROOM_STATUS_STYLES, getActiveBooking } from './room.utils';

interface RoomCardProps {
  room: Room;
  bookings?: Booking[];
  onView?: (room: Room) => void;
  onCheckIn?: (booking: Booking) => void;
  onCheckOut?: (booking: Booking) => void;
  onCreateBooking?: (room: Room) => void;
  onMarkCleaning?: (room: Room) => void;
  onMarkMaintenance?: (room: Room) => void;
}

export function RoomCard({ room, bookings, onView, onCheckIn, onCheckOut, onCreateBooking, onMarkCleaning, onMarkMaintenance }: RoomCardProps) {
  const style = ROOM_STATUS_STYLES[room.status] ?? ROOM_STATUS_STYLES.available;
  const activeBooking = getActiveBooking(room.id, bookings);

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border-2 transition-colors ${style.bg}`}>
      <div className="flex flex-col items-center p-4 text-center">
        <span className="text-xl font-bold">{room.room_number}</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">{room.room_types?.name ?? 'Room'}</span>
        <Badge variant={style.badge} className="mt-2 text-[10px] uppercase tracking-wider">{style.label}</Badge>
        {activeBooking && (
          <div className="mt-2 w-full rounded-md bg-muted/60 px-2 py-1.5 text-xs">
            <span className="font-medium">{activeBooking.guest_name}</span>
          </div>
        )}
      </div>
      <div className="flex border-t border-border divide-x divide-border">
        {room.status === 'available' && onCreateBooking && (
          <button type="button" onClick={() => onCreateBooking(room)} className="flex-1 py-2 text-[11px] font-medium text-primary hover:bg-black/5 transition-colors">
            <CalendarCheck className="h-3.5 w-3.5 mx-auto mb-0.5" /> Book
          </button>
        )}
        {room.status === 'occupied' && activeBooking && onCheckOut && (
          <button type="button" onClick={() => onCheckOut(activeBooking)} className="flex-1 py-2 text-[11px] font-medium text-orange-600 hover:bg-black/5 transition-colors">
            <LogOut className="h-3.5 w-3.5 mx-auto mb-0.5" /> Check Out
          </button>
        )}
        {(room.status === 'reserved' || room.status === 'booked') && activeBooking && onCheckIn && (
          <button type="button" onClick={() => onCheckIn(activeBooking)} className="flex-1 py-2 text-[11px] font-medium text-primary hover:bg-black/5 transition-colors">
            <LogIn className="h-3.5 w-3.5 mx-auto mb-0.5" /> Check In
          </button>
        )}
        {room.status !== 'cleaning' && onMarkCleaning && (
          <button type="button" onClick={() => onMarkCleaning(room)} className="flex-1 py-2 text-[11px] font-medium text-muted-foreground hover:bg-black/5 transition-colors" title="Mark Cleaning">
            <Paintbrush className="h-3.5 w-3.5 mx-auto mb-0.5" /> Clean
          </button>
        )}
        {room.status !== 'maintenance' && onMarkMaintenance && (
          <button type="button" onClick={() => onMarkMaintenance(room)} className="flex-1 py-2 text-[11px] font-medium text-muted-foreground hover:bg-black/5 transition-colors" title="Mark Maintenance">
            <Wrench className="h-3.5 w-3.5 mx-auto mb-0.5" /> Maint.
          </button>
        )}
        {onView && (
          <button type="button" onClick={() => onView(room)} className="flex-1 py-2 text-[11px] font-medium text-muted-foreground hover:bg-black/5 transition-colors">
            View
          </button>
        )}
      </div>
    </div>
  );
}
