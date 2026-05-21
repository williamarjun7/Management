import type { Room, Booking } from '../../types';
import { RoomCard } from './RoomCard';

interface RoomGridProps {
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

export function RoomGrid({ rooms, bookings, isLoading, onView, onCheckIn, onCheckOut, onCreateBooking, onMarkCleaning, onMarkMaintenance }: RoomGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col rounded-xl border-2">
            <div className="p-3 space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded w-1/2 mx-auto" />
              <div className="h-5 bg-muted animate-pulse rounded w-1/3 mx-auto" />
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          bookings={bookings}
          onView={onView}
          onCheckIn={onCheckIn}
          onCheckOut={onCheckOut}
          onCreateBooking={onCreateBooking}
          onMarkCleaning={onMarkCleaning}
          onMarkMaintenance={onMarkMaintenance}
        />
      ))}
    </div>
  );
}
