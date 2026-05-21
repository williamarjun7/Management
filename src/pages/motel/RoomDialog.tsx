import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { useRoomTypes, useCreateRoom, useUpdateRoom } from "../../lib/hooks";
import { roomSchema } from "../../lib/core/validations";
import type { Room } from "../../types";
import type { z } from "zod";

interface Props {
  open: boolean;
  onClose: () => void;
  room?: Room | null;
}

export default function RoomDialog({ open, onClose, room }: Props) {
  const { data: roomTypes } = useRoomTypes();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const saving = create.isPending || update.isPending;

  const [roomNumber, setRoomNumber] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);

  useEffect(() => {
    if (room) {
      setRoomNumber(room.room_number);
      setRoomTypeId(room.room_type_id);
    } else {
      setRoomNumber("");
      setRoomTypeId(roomTypes?.[0]?.id ?? "");
    }
  }, [room, roomTypes, open]);

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = roomSchema.safeParse({
      room_number: roomNumber.trim(),
      room_type_id: roomTypeId,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);

    if (room) {
      await update.mutateAsync({ id: room.id, ...parsed.data });
    } else {
      await create.mutateAsync(parsed.data);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{room ? "Edit Room" : "Add Room"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="r-number">Room Number</Label>
            <Input id="r-number" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="e.g. 101" required autoFocus />
            {getError("room_number") && <p className="text-xs text-destructive">{getError("room_number")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-type">Room Type</Label>
            <Select id="r-type" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} options={roomTypes?.map((rt) => ({ value: rt.id, label: rt.name })) ?? []} placeholder="Select room type" required />
            {getError("room_type_id") && <p className="text-xs text-destructive">{getError("room_type_id")}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !roomNumber.trim() || !roomTypeId}>
              {saving ? "Saving\u2026" : room ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
