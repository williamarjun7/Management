import { useState, useCallback } from "react";
import { X, Clock } from "lucide-react";
import { useRooms, useCreateBooking, useRoomMappings } from "../../lib/hooks";
import { pushBookingToWebsite } from "../../lib/services/booking-sync";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { useSettings } from "../../lib/core/settings-context";

import { bookingSchema } from "../../lib/core/validations";
import type { Room } from "../../types";
import type { z } from "zod";

interface BookingFormProps {
  preselectedRoomId?: string;
  onClose: () => void;
}

export function BookingForm({ preselectedRoomId, onClose }: BookingFormProps) {
  const { data: rooms } = useRooms();
  const { data: mappings } = useRoomMappings();
  const createBooking = useCreateBooking();
  const { settings } = useSettings();

  const [roomId, setRoomId] = useState(preselectedRoomId ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkIn, setCheckIn] = useState(new Date().toISOString().split("T")[0]);
  const [checkOut, setCheckOut] = useState(
    new Date(Date.now() + 86400000).toISOString().split("T")[0]
  );
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);

  const selectedRoom = rooms?.find((r: Room) => r.id === roomId);
  const basePrice = selectedRoom?.room_types?.base_price ?? settings.motel.default_nightly_rate;
  const [nightlyRate, setNightlyRate] = useState(String(basePrice));

  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
    )
  );
  const totalAmount = nights * Number(nightlyRate);

  const availableRooms = rooms?.filter(
    (r: Room) => r.status === "available"
  ) ?? [];

  const roomOptions = availableRooms.map((r: Room) => ({
    value: r.id,
    label: `Room ${r.room_number} - ${r.room_types?.name ?? ""}`,
  }));

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  const syncBookingToWebsite = useCallback(async (bookingResult: Record<string, unknown>, roomId: string, guestName: string, guestPhone: string, checkInRaw: string, checkOutRaw: string, adults: string, children: string, nightlyRate: string, notes: string) => {
    try {
      const mapping = mappings?.find(m => m.pos_room_id === roomId);
      if (!mapping?.website_room_id) return;
      const bookingId = bookingResult?.booking_id as string;
      if (!bookingId) return;
      const idempotencyKey = crypto.randomUUID();
      await pushBookingToWebsite({
        external_booking_id: `pos:${bookingId}`,
        website_room_id: mapping.website_room_id,
        guest_name: guestName,
        guest_phone: guestPhone || undefined,
        check_in: new Date(checkInRaw).toISOString(),
        check_out: new Date(checkOutRaw).toISOString(),
        adults: parseInt(adults) || 1,
        children: parseInt(children) || 0,
        nightly_rate: parseFloat(nightlyRate) || 0,
        total_amount: 0,
        notes: notes || undefined,
        idempotency_key: idempotencyKey,
      });
    } catch (err) {
      console.error('Failed to sync booking to website:', err);
    }
  }, [mappings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = bookingSchema.safeParse({
      room_id: roomId,
      guest_name: guestName,
      guest_phone: guestPhone || undefined,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children,
      nightly_rate: nightlyRate,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);
    try {
      const checkInDate = new Date(parsed.data.check_in);
      const [ciH, ciM] = settings.motel.check_in_time.split(':').map(Number);
      checkInDate.setHours(ciH || 14, ciM || 0, 0, 0);
      const checkOutDate = new Date(parsed.data.check_out);
      const [coH, coM] = settings.motel.check_out_time.split(':').map(Number);
      checkOutDate.setHours(coH || 12, coM || 0, 0, 0);
      const result = await createBooking.mutateAsync({
        ...parsed.data,
        check_in: checkInDate.toISOString(),
        check_out: checkOutDate.toISOString(),
        total_amount: totalAmount,
      });
      syncBookingToWebsite(result as Record<string, unknown>, roomId, guestName, guestPhone, checkIn, checkOut, adults, children, nightlyRate, notes);
      onClose();
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Booking</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="room">Room *</Label>
            <Select
              id="room"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                const r = rooms?.find((r: Room) => r.id === e.target.value);
                if (r?.room_types?.base_price) {
                  setNightlyRate(String(r.room_types.base_price));
                }
              }}
              options={roomOptions}
              placeholder="Select a room"
            />
            {getError("room_id") && <p className="text-xs text-destructive">{getError("room_id")}</p>}
            {selectedRoom && (
              <p className="mt-1 text-xs text-muted-foreground">
                Room {selectedRoom.room_number} — {selectedRoom.room_types?.name} — Rs. {Number(selectedRoom.room_types?.base_price ?? 0).toFixed(2)}/night
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guestName">Guest Name *</Label>
              <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
              {getError("guest_name") && <p className="text-xs text-destructive">{getError("guest_name")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestPhone">Phone</Label>
              <Input id="guestPhone" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="checkIn">Check-in *</Label>
              <Input id="checkIn" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Check-in from {settings.motel.check_in_time}</p>
              {getError("check_in") && <p className="text-xs text-destructive">{getError("check_in")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkOut">Check-out *</Label>
              <Input id="checkOut" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Check-out by {settings.motel.check_out_time}</p>
              {getError("check_out") && <p className="text-xs text-destructive">{getError("check_out")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adults">Adults</Label>
              <Input id="adults" type="number" min="1" max="10" value={adults} onChange={(e) => setAdults(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="children">Children</Label>
              <Input id="children" type="number" min="0" max="10" value={children} onChange={(e) => setChildren(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nightlyRate">Nightly Rate (Rs.)</Label>
            <Input id="nightlyRate" type="number" step="0.01" min="0" value={nightlyRate} onChange={(e) => setNightlyRate(e.target.value)} />
          </div>

          <div className="rounded-lg border bg-muted p-3">
            <div className="flex justify-between text-sm">
              <span>Nights: {nights}</span>
              <span>Rate: Rs. {Number(nightlyRate).toFixed(2)}</span>
            </div>
            <div className="mt-1 flex justify-between font-bold">
              <span>Total</span>
              <span>Rs. {totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">Cancel</Button>
            <Button type="submit" disabled={createBooking.isPending} className="min-h-[44px]">
              {createBooking.isPending ? "Creating..." : "Create Booking"}
            </Button>
          </div>
        </form>

        {createBooking.isError && (
          <p className="mt-2 text-sm text-destructive">
            {(createBooking.error as Error)?.message || "Failed to create booking"}
          </p>
        )}
      </div>
    </div>
  );
}
