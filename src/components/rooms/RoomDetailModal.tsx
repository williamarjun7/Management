import { X, Building2, Users, Calendar, Wrench, Paintbrush, CalendarCheck, LogIn, LogOut } from 'lucide-react';
import type { Room, Booking } from '../../types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ROOM_STATUS_STYLES, getRoomImage, getRoomCapacity, getActiveBooking } from './room.utils';

interface RoomDetailModalProps {
  room: Room;
  bookings?: Booking[];
  open: boolean;
  onClose: () => void;
  onCheckIn?: (booking: Booking) => void;
  onCheckOut?: (booking: Booking) => void;
  onCreateBooking?: (room: Room) => void;
  onMarkCleaning?: (room: Room) => void;
  onMarkMaintenance?: (room: Room) => void;
  onNavigateDetail?: (room: Room) => void;
}

export function RoomDetailModal({ room, bookings, open, onClose, onCheckIn, onCheckOut, onCreateBooking, onMarkCleaning, onMarkMaintenance, onNavigateDetail }: RoomDetailModalProps) {
  if (!open) return null;

  const style = ROOM_STATUS_STYLES[room.status] ?? ROOM_STATUS_STYLES.available;
  const roomImage = getRoomImage(room);
  const capacity = getRoomCapacity(room);
  const activeBooking = getActiveBooking(room.id, bookings);



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {roomImage ? (
            <div className="h-40 overflow-hidden">
              <img src={roomImage} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center bg-muted/40">
              <Building2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full bg-background/80 p-1.5 hover:bg-background transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <span className="rounded-lg bg-background/90 px-3 py-1 text-xl font-extrabold shadow-sm">
              R{room.room_number}
            </span>
            <Badge variant={style.badge} className="text-xs">{style.label}</Badge>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Room Type</span>
              <p className="font-medium">{room.room_types?.name ?? 'N/A'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Floor</span>
              <p className="font-medium">{room.floor ?? 'N/A'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Max Guests</span>
              <p className="font-medium flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {capacity}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Nightly Rate</span>
              <p className="font-medium">Rs. {Number(room.room_types?.base_price ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {room.room_types?.amenities && room.room_types.amenities.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Amenities</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {room.room_types.amenities.map((a: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {room.notes && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              {room.notes}
            </p>
          )}

          {activeBooking && (
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Active Booking
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Guest</span>
                  <p className="font-medium">{activeBooking.guest_name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Booking #</span>
                  <p className="font-medium">{activeBooking.booking_number}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Check In</span>
                  <p className="font-medium">{new Date(activeBooking.check_in).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Check Out</span>
                  <p className="font-medium">{new Date(activeBooking.check_out).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2">Quick Actions</h4>
            <div className="flex flex-wrap gap-2">
              {room.status === 'available' && onCreateBooking && (
                <Button size="sm" onClick={() => { onCreateBooking(room); onClose(); }} className="min-h-[44px]">
                  <CalendarCheck className="mr-1 h-4 w-4" /> Create Booking
                </Button>
              )}
              {room.status === 'reserved' && activeBooking && onCheckIn && (
                <Button size="sm" onClick={() => { onCheckIn(activeBooking); onClose(); }} className="min-h-[44px]">
                  <LogIn className="mr-1 h-4 w-4" /> Check In
                </Button>
              )}
              {room.status === 'occupied' && activeBooking && onCheckOut && (
                <Button size="sm" variant="outline" onClick={() => { onCheckOut(activeBooking); onClose(); }} className="min-h-[44px] text-orange-600 border-orange-300">
                  <LogOut className="mr-1 h-4 w-4" /> Check Out
                </Button>
              )}
              {room.status !== 'cleaning' && onMarkCleaning && (
                <Button size="sm" variant="secondary" onClick={() => { onMarkCleaning(room); onClose(); }} className="min-h-[44px]">
                  <Paintbrush className="mr-1 h-4 w-4" /> Mark Cleaning
                </Button>
              )}
              {room.status !== 'maintenance' && onMarkMaintenance && (
                <Button size="sm" variant="secondary" onClick={() => { onMarkMaintenance(room); onClose(); }} className="min-h-[44px]">
                  <Wrench className="mr-1 h-4 w-4" /> Mark Maintenance
                </Button>
              )}
            </div>
          </div>
        </div>

        {onNavigateDetail && (
          <div className="border-t p-4">
            <Button
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={() => { onNavigateDetail(room); onClose(); }}
            >
              <Building2 className="mr-2 h-4 w-4" /> Full Room Details
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
