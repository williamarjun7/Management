import type { Room, Booking, RoomStatus } from '../../types';

export const ROOM_STATUS_STYLES: Record<RoomStatus, { badge: 'success' | 'destructive' | 'warning' | 'outline' | 'secondary'; dot: string; bg: string; label: string }> = {
  available: { badge: 'success', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800', label: 'Available' },
  occupied: { badge: 'destructive', dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800', label: 'Occupied' },
  reserved: { badge: 'warning', dot: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800', label: 'Reserved' },
  cleaning: { badge: 'outline', dot: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800', label: 'Cleaning' },
  maintenance: { badge: 'outline', dot: 'bg-gray-500', bg: 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800', label: 'Maintenance' },
};

export function getRoomImage(room: Room): string | null {
  return room.image_url || room.room_types?.image_url || null;
}

export function getRoomCapacity(room: Room): number {
  return room.room_types?.max_guests ?? 0;
}

export function getActiveBooking(roomId: string, bookings: Booking[] | undefined): Booking | null {
  if (!bookings) return null;
  return bookings.find(
    (b) => b.room_id === roomId && ['confirmed', 'checked_in'].includes(b.status)
  ) ?? null;
}
