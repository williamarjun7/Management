import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { useRoomTypes, useCreateRoom, useUpdateRoom } from "../../lib/hooks";
import { uploadImage } from "../../lib/services/upload";
import ImageUpload from "../../components/ImageUpload";
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [roomNumber, setRoomNumber] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [floor, setFloor] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);

  useEffect(() => {
    if (room) {
      setRoomNumber(room.room_number);
      setRoomTypeId(room.room_type_id);
      setFloor(room.floor ?? "");
      setNotes(room.notes ?? "");
      setImageUrl(room.image_url);
    } else {
      setRoomNumber("");
      setRoomTypeId(roomTypes?.[0]?.id ?? "");
      setFloor("");
      setNotes("");
      setImageUrl(null);
    }
  }, [room, roomTypes, open]);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const { url } = await uploadImage(file, "rooms");
      setImageUrl(url);
      if (room) {
        await update.mutateAsync({ id: room.id, image_url: url });
      }
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImageRemove() {
    setImageUrl(null);
    if (room) {
      await update.mutateAsync({ id: room.id, image_url: null });
    }
  }

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = roomSchema.safeParse({
      room_number: roomNumber.trim(),
      room_type_id: roomTypeId,
      floor: floor.trim() || undefined,
      notes: notes.trim() || undefined,
      image_url: imageUrl,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);

    const payload = parsed.data;

    if (room) {
      await update.mutateAsync({ id: room.id, ...payload, image_url: payload.image_url ?? null });
    } else {
      await create.mutateAsync({ ...payload, image_url: payload.image_url ?? null });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">
          {room ? "Edit Room" : "Add Room"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="r-number">Room Number</Label>
            <Input
              id="r-number"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. 101"
              required
              autoFocus
            />
            {getError("room_number") && <p className="text-xs text-destructive">{getError("room_number")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-type">Room Type</Label>
            <Select
              id="r-type"
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
              options={roomTypes?.map((rt) => ({ value: rt.id, label: rt.name })) ?? []}
              placeholder="Select room type"
              required
            />
            {getError("room_type_id") && <p className="text-xs text-destructive">{getError("room_type_id")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-floor">Floor (optional)</Label>
            <Input
              id="r-floor"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 1st Floor"
            />
          </div>
          <div className="space-y-2">
            <Label>Photo</Label>
            <ImageUpload
              currentUrl={imageUrl}
              onUpload={handleImageUpload}
              onRemove={handleImageRemove}
              uploading={uploadingImage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-notes">Notes (optional)</Label>
            <Input
              id="r-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special notes"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !roomNumber.trim() || !roomTypeId}>
              {saving ? "Saving…" : room ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
