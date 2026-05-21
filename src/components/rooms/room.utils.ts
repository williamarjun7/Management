import type { Booking, RoomStatus } from '../../types';

export const ROOM_STATUS_STYLES: Record<RoomStatus, { badge: 'success' | 'destructive' | 'warning' | 'outline' | 'secondary'; dot: string; bg: string; label: string }> = {
  available: { badge: 'success', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800', label: 'Available' },
  reserved: { badge: 'warning', dot: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800', label: 'Booked' },
  booked: { badge: 'warning', dot: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800', label: 'Booked' },
  occupied: { badge: 'destructive', dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800', label: 'Occupied' },
  partial_paid: { badge: 'secondary', dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800', label: 'Partial Paid' },
  fully_paid: { badge: 'success', dot: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800', label: 'Fully Paid' },
  cleaning: { badge: 'outline', dot: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800', label: 'Cleaning' },
  maintenance: { badge: 'outline', dot: 'bg-gray-500', bg: 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800', label: 'Maintenance' },
};

export function getActiveBooking(roomId: string, bookings: Booking[] | undefined): Booking | null {
  if (!bookings) return null;
  return bookings.find(
    (b) => b.room_id === roomId && ['confirmed', 'checked_in'].includes(b.status)
  ) ?? null;
}
