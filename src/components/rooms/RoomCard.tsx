import { Hotel, ImageIcon, Users, LogIn, LogOut, Paintbrush, Wrench, CalendarCheck } from 'lucide-react';
import type { Room, Booking } from '../../types';
import { Badge } from '../../components/ui/badge';
import { ROOM_STATUS_STYLES, getRoomImage, getRoomCapacity, getActiveBooking } from './room.utils';

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
  const roomImage = getRoomImage(room);
  const capacity = getRoomCapacity(room);
  const activeBooking = getActiveBooking(room.id, bookings);
  const isOccupied = room.status === 'occupied';
  const isReserved = room.status === 'reserved';

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]">
      <button
        type="button"
        onClick={() => onView?.(room)}
        className="flex flex-col flex-1 text-left"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted/40">
          {roomImage ? (
            <img
              src={roomImage}
              alt={`Room ${room.room_number}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
          {(isOccupied || isReserved) && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOccupied ? 'bg-red-400' : 'bg-yellow-400'}`} />
              <span className={`relative inline-flex rounded-full h-4 w-4 border-2 border-white dark:border-gray-900 ${isOccupied ? 'bg-red-500' : 'bg-yellow-500'}`} />
            </span>
          )}
          <div className="absolute top-2 left-2">
            <span className="rounded-md bg-background/90 px-2 py-0.5 text-lg font-extrabold leading-none shadow-sm">
              R{room.room_number}
            </span>
          </div>
          {room.floor && (
            <div className="absolute bottom-2 right-2">
              <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
                {room.floor}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 p-3 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground truncate">
              {room.room_types?.name ?? 'Room'}
            </span>
            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {capacity > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {capacity} guests
              </span>
            )}
            {room.room_types?.base_price != null && (
              <span>Rs. {Number(room.room_types.base_price).toFixed(0)}/nt</span>
            )}
          </div>

          <Badge variant={style.badge} className="w-fit text-[10px] uppercase tracking-wider mt-1">
            {style.label}
          </Badge>

          {activeBooking && (
            <div className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
              <span className="font-medium">{activeBooking.guest_name}</span>
              <span className="text-muted-foreground ml-1">
                {new Date(activeBooking.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </button>

      <div className="flex border-t border-border divide-x divide-border">
        {room.status === 'available' && onCreateBooking && (
          <button
            type="button"
            onClick={() => onCreateBooking(room)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium text-primary hover:bg-accent transition-colors"
          >
            <CalendarCheck className="h-3.5 w-3.5" /> Book
          </button>
        )}
        {room.status === 'occupied' && activeBooking && onCheckOut && (
          <button
            type="button"
            onClick={() => onCheckOut(activeBooking)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium hover:bg-accent transition-colors text-orange-600"
          >
            <LogOut className="h-3.5 w-3.5" /> Check Out
          </button>
        )}
        {room.status === 'reserved' && activeBooking && onCheckIn && (
          <button
            type="button"
            onClick={() => onCheckIn(activeBooking)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium hover:bg-accent transition-colors text-primary"
          >
            <LogIn className="h-3.5 w-3.5" /> Check In
          </button>
        )}
        {room.status !== 'cleaning' && onMarkCleaning && (
          <button
            type="button"
            onClick={() => onMarkCleaning(room)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium hover:bg-accent transition-colors text-muted-foreground"
            title="Mark Cleaning"
          >
            <Paintbrush className="h-3.5 w-3.5" />
          </button>
        )}
        {room.status !== 'maintenance' && onMarkMaintenance && (
          <button
            type="button"
            onClick={() => onMarkMaintenance(room)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium hover:bg-accent transition-colors text-muted-foreground"
            title="Mark Maintenance"
          >
            <Wrench className="h-3.5 w-3.5" />
          </button>
        )}
        {onView && (
          <button
            type="button"
            onClick={() => onView(room)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium hover:bg-accent transition-colors text-muted-foreground"
            title="View Details"
          >
            <Hotel className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
