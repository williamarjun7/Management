import { useState } from "react";
import { X, ImageIcon } from "lucide-react";
import { useRooms, useCreateBooking } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { bookingSchema } from "../../lib/core/validations";
import type { Room } from "../../types";
import type { z } from "zod";

interface BookingFormProps {
  preselectedRoomId?: string;
  onClose: () => void;
}

export function BookingForm({ preselectedRoomId, onClose }: BookingFormProps) {
  const { data: rooms } = useRooms();
  const createBooking = useCreateBooking();

  const [roomId, setRoomId] = useState(preselectedRoomId ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestIdProof, setGuestIdProof] = useState("");
  const [checkIn, setCheckIn] = useState(new Date().toISOString().split("T")[0]);
  const [checkOut, setCheckOut] = useState(
    new Date(Date.now() + 86400000).toISOString().split("T")[0]
  );
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);

  const selectedRoom = rooms?.find((r: Room) => r.id === roomId);
  const basePrice = selectedRoom?.room_types?.base_price ?? 0;
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
    label: `Room ${r.room_number} - ${r.room_types?.name ?? ""} (${r.status})`,
  }));

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = bookingSchema.safeParse({
      room_id: roomId,
      guest_name: guestName,
      guest_phone: guestPhone || undefined,
      guest_email: guestEmail || undefined,
      guest_id_proof: guestIdProof || undefined,
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
      await createBooking.mutateAsync({
        ...parsed.data,
        check_in: new Date(parsed.data.check_in).toISOString(),
        check_out: new Date(parsed.data.check_out).toISOString(),
        total_amount: totalAmount,
      });
      onClose();
    } catch {}
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
              <div className="mt-2 flex items-center gap-3 rounded-lg border bg-muted/30 p-2">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  {(selectedRoom.image_url || selectedRoom.room_types?.image_url) ? (
                    <img
                      src={selectedRoom.image_url || selectedRoom.room_types?.image_url || ""}
                      alt={`Room ${selectedRoom.room_number}`}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-medium">Room {selectedRoom.room_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedRoom.room_types?.name} | Max {selectedRoom.room_types?.max_guests} guests
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Rs. {Number(selectedRoom.room_types?.base_price ?? 0).toFixed(2)}/night
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guestName">Guest Name *</Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
              {getError("guest_name") && <p className="text-xs text-destructive">{getError("guest_name")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestPhone">Phone</Label>
              <Input
                id="guestPhone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guestEmail">Email</Label>
              <Input
                id="guestEmail"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idProof">ID Proof</Label>
              <Input
                id="idProof"
                value={guestIdProof}
                onChange={(e) => setGuestIdProof(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="checkIn">Check-in *</Label>
              <Input
                id="checkIn"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
              />
              {getError("check_in") && <p className="text-xs text-destructive">{getError("check_in")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkOut">Check-out *</Label>
              <Input
                id="checkOut"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                required
              />
              {getError("check_out") && <p className="text-xs text-destructive">{getError("check_out")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adults">Adults</Label>
              <Input
                id="adults"
                type="number"
                min="1"
                max="10"
                value={adults}
                onChange={(e) => setAdults(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="children">Children</Label>
              <Input
                id="children"
                type="number"
                min="0"
                max="10"
                value={children}
                onChange={(e) => setChildren(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nightlyRate">Nightly Rate (Rs.)</Label>
            <Input
              id="nightlyRate"
              type="number"
              step="0.01"
              min="0"
              value={nightlyRate}
              onChange={(e) => setNightlyRate(e.target.value)}
            />
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
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              Cancel
            </Button>
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
