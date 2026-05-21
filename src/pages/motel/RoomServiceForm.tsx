import { useState } from "react";
import { X } from "lucide-react";
import { useCreateRoomService } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { roomServiceSchema } from "../../lib/core/validations";
import type { z } from "zod";

const serviceTypes = [
  { value: "room_service", label: "Room Service" },
  { value: "minibar", label: "Minibar" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "other", label: "Other" },
];

interface RoomServiceFormProps {
  roomId: string;
  bookingId: string;
  onClose: () => void;
}

export function RoomServiceForm({ roomId, bookingId, onClose }: RoomServiceFormProps) {
  const [serviceType, setServiceType] = useState("room_service");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);
  const createRoomService = useCreateRoomService();

  const total = Number(quantity) * Number(unitPrice);

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = roomServiceSchema.safeParse({
      booking_id: bookingId,
      room_id: roomId,
      description,
      quantity,
      unit_price: unitPrice,
      service_type: serviceType,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);
    try {
      await createRoomService.mutateAsync({
        ...parsed.data,
        total,
        quantity: Number(parsed.data.quantity),
        unit_price: Number(parsed.data.unit_price),
      });
      onClose();
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Room Service</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serviceType">Service Type</Label>
            <Select
              id="serviceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              options={serviceTypes}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Extra towels, Club Sandwich"
              required
            />
            {getError("description") && <p className="text-xs text-destructive">{getError("description")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Unit Price (Rs.)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
          </div>

          {Number(unitPrice) > 0 && (
            <div className="rounded-lg border bg-muted p-3">
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>Rs. {total.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={createRoomService.isPending} className="min-h-[44px]">
              {createRoomService.isPending ? "Adding..." : "Add Service"}
            </Button>
          </div>
        </form>

        {createRoomService.isError && (
          <p className="mt-2 text-sm text-destructive">
            {(createRoomService.error as Error)?.message || "Failed to add service"}
          </p>
        )}
      </div>
    </div>
  );
}
