import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Check, X, Trash2, ImageIcon } from "lucide-react";
import { useRoom, useUpdateRoomStatus, useUpdateRoomTypeImage, useUpdateRoomImage, useDeleteRoom } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { RoomServiceForm } from "./RoomServiceForm";
import { insforge } from "../../lib/core/insforge";
import { useQuery } from "@tanstack/react-query";
import { uploadImage, extractStorageKeyFromUrl, deleteImage } from "../../lib/services/upload";
import ImageUpload from "../../components/ImageUpload";
import type { Booking } from "../../types";

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "available": return "default" as const;
    case "occupied": return "destructive" as const;
    case "reserved": return "secondary" as const;
    case "cleaning": return "outline" as const;
    case "maintenance": return "outline" as const;
    default: return "default" as const;
  }
};

const roomStatusActions: { status: string; label: string; color: string }[] = [
  { status: "available", label: "Mark Available", color: "bg-green-600 hover:bg-green-700" },
  { status: "cleaning", label: "Mark Cleaning", color: "bg-orange-600 hover:bg-orange-700" },
  { status: "maintenance", label: "Mark Maintenance", color: "bg-gray-600 hover:bg-gray-700" },
  { status: "reserved", label: "Mark Reserved", color: "bg-yellow-600 hover:bg-yellow-700" },
];

function useCurrentBooking(roomId: string | undefined) {
  return useQuery({
    queryKey: ['current-booking', roomId],
    enabled: !!roomId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('bookings')
        .select('*, rooms(*, room_types(*)), room_services(*)')
        .eq('room_id', roomId)
        .in('status', ['confirmed', 'checked_in'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return (data ?? null) as Booking | null;
    },
  });
}

export default function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: room, isLoading } = useRoom(id);
  const { data: currentBooking } = useCurrentBooking(id);
  const updateStatus = useUpdateRoomStatus();
  const updateRoomTypeImage = useUpdateRoomTypeImage();
  const updateRoomImage = useUpdateRoomImage();
  const deleteRoom = useDeleteRoom();
  const [uploadingRoomTypeImage, setUploadingRoomTypeImage] = useState(false);
  const [uploadingRoomImage, setUploadingRoomImage] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [confirmStatusTarget, setConfirmStatusTarget] = useState<{
    status: string;
    label: string;
  } | null>(null);
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState(false);

  async function handleRoomTypeImageUpload(file: File) {
    setUploadingRoomTypeImage(true);
    try {
      const { url } = await uploadImage(file, "room-types");
      if (room?.room_types?.id) {
        await updateRoomTypeImage.mutateAsync({ id: room.room_types.id, image_url: url });
        showSuccess("Room type image updated");
      } else {
        showError("Room type not found. Cannot save image.");
      }
    } catch (err) {
      showError((err as Error)?.message || "Image upload failed");
    } finally {
      setUploadingRoomTypeImage(false);
    }
  }

  async function handleRoomTypeImageRemove() {
    if (room?.room_types?.id) {
      try {
        await updateRoomTypeImage.mutateAsync({ id: room.room_types.id, image_url: null });
        showSuccess("Image removed");
      } catch (err) {
        showError((err as Error)?.message || "Failed to remove image");
      }
    }
  }

  async function handleRoomImageUpload(file: File) {
    setUploadingRoomImage(true);
    try {
      const { url } = await uploadImage(file, "rooms");
      if (room?.image_url) {
        const oldKey = extractStorageKeyFromUrl(room.image_url);
        if (oldKey) {
          deleteImage(oldKey).catch(() => {});
        }
      }
      if (room) {
        await updateRoomImage.mutateAsync({ id: room.id, image_url: url });
        showSuccess("Room image updated");
      }
    } catch (err) {
      showError((err as Error)?.message || "Image upload failed");
    } finally {
      setUploadingRoomImage(false);
    }
  }

  async function handleRoomImageRemove() {
    if (room) {
      if (room.image_url) {
        const key = extractStorageKeyFromUrl(room.image_url);
        if (key) {
          deleteImage(key).catch(() => {});
        }
      }
      try {
        await updateRoomImage.mutateAsync({ id: room.id, image_url: null });
        showSuccess("Room image removed");
      } catch (err) {
        showError((err as Error)?.message || "Failed to remove image");
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/motel")} className="min-h-[44px]">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="text-center text-muted-foreground">Room not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/motel")} className="min-h-[44px]">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          {room.status === "occupied" && (
            <Button onClick={() => setShowServiceForm(true)} variant="outline" className="min-h-[44px]">
              Add Room Service
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteRoom(true)}
            className="min-h-[44px]"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete Room
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="h-6 w-6" />
                <div>
                  <CardTitle className="text-xl">Room {room.room_number}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {room.room_types?.name} {room.floor && `| Floor ${room.floor}`}
                  </p>
                </div>
              </div>
              <Badge variant={statusBadgeVariant(room.status)} className="text-sm px-3 py-1">
                {room.status.charAt(0).toUpperCase() + room.status.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {(room.image_url || room.room_types?.image_url) && (
              <div className="mb-4 overflow-hidden rounded-lg relative">
                <img
                  src={room.image_url || room.room_types?.image_url || ""}
                  alt={room.room_types?.name ?? `Room ${room.room_number}`}
                  className="h-48 w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {room.image_url && (
                  <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-[10px] font-medium">
                    Room Photo
                  </span>
                )}
                {!room.image_url && room.room_types?.image_url && (
                  <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-[10px] font-medium">
                    Type Photo
                  </span>
                )}
              </div>
            )}
            {!room.image_url && !room.room_types?.image_url && (
              <div className="mb-4 flex h-48 items-center justify-center rounded-lg border border-dashed bg-muted/30">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Room Photo</Label>
                <ImageUpload
                  currentUrl={room.image_url}
                  onUpload={handleRoomImageUpload}
                  onRemove={handleRoomImageRemove}
                  uploading={uploadingRoomImage}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Room Type Photo</Label>
                </div>
                <ImageUpload
                  currentUrl={room.room_types?.image_url}
                  onUpload={handleRoomTypeImageUpload}
                  onRemove={handleRoomTypeImageRemove}
                  uploading={uploadingRoomTypeImage}
                />
              </div>
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Max Guests:</span>
                <span className="ml-2 font-medium">{room.room_types?.max_guests}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Base Rate:</span>
                <span className="ml-2 font-medium">Rs. {Number(room.room_types?.base_price ?? 0).toFixed(2)}/night</span>
              </div>
            </div>

            {room.room_types?.amenities && room.room_types.amenities.length > 0 && (
              <div className="mt-4">
                <span className="text-sm text-muted-foreground">Amenities:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {room.room_types.amenities.map((a: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                  ))}
                </div>
              </div>
            )}

            {room.notes && (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium">Notes:</span> {room.notes}
              </p>
            )}

            <Separator className="my-4" />

            <div>
              <p className="mb-2 text-sm font-semibold">Status Actions</p>
              <div className="flex flex-wrap gap-2">
                {roomStatusActions
                  .filter((a) => a.status !== room.status)
                  .map((action) => (
                    <Button
                      key={action.status}
                      size="sm"
                      className={`min-h-[44px] ${action.color}`}
                      onClick={() => setConfirmStatusTarget({ status: action.status, label: action.label })}
                      disabled={updateStatus.isPending}
                    >
                      <Check className="mr-1 h-3 w-3" /> {action.label}
                    </Button>
                  ))}
                {room.status !== "occupied" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() => navigate(`/motel/bookings/new?room_id=${room.id}`)}
                  >
                    Create Booking
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Booking</CardTitle>
          </CardHeader>
          <CardContent>
            {currentBooking ? (
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Guest:</span> {currentBooking.guest_name}</p>
                <p><span className="text-muted-foreground">Check-in:</span> {new Date(currentBooking.check_in).toLocaleDateString()}</p>
                <p><span className="text-muted-foreground">Check-out:</span> {new Date(currentBooking.check_out).toLocaleDateString()}</p>
                <p><span className="text-muted-foreground">Status:</span> {currentBooking.status.replace("_", " ")}</p>
                <p><span className="text-muted-foreground">Booking:</span> {currentBooking.booking_number}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <X className="mb-2 h-8 w-8" />
                <p className="text-sm">No active booking</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmStatusTarget !== null}
        onOpenChange={(open) => { if (!open) setConfirmStatusTarget(null); }}
        title={`Change Room Status to ${confirmStatusTarget?.label ?? ""}`}
        description={`This will change Room ${room?.room_number ?? ""} status to "${confirmStatusTarget?.status ?? ""}".`}
        consequence={
          confirmStatusTarget?.status === "maintenance"
            ? "Room will be removed from available inventory until manually returned."
            : confirmStatusTarget?.status === "cleaning"
              ? "Room will be withheld from booking until cleaning is marked complete."
              : "This change will be logged in room state transitions."
        }
        entity={`Room ${room?.room_number ?? ""}`}
        confirmLabel={`Mark ${confirmStatusTarget?.label ?? ""}`}
        confirmVariant={confirmStatusTarget?.status === "maintenance" ? "destructive" : "secondary"}
        onConfirm={() => {
          if (!confirmStatusTarget || !room) return;
          updateStatus.mutate(
            { id: room.id, status: confirmStatusTarget.status, reason: `Manual status change to ${confirmStatusTarget.status}` },
            {
              onSuccess: () => {
                showSuccess(`Room ${room.room_number} marked as ${confirmStatusTarget.status}`);
                setConfirmStatusTarget(null);
              },
              onError: (err) => showError((err as Error)?.message || "Failed to update room status"),
            }
          );
        }}
        isPending={updateStatus.isPending}
      />

      {showServiceForm && currentBooking && room && (
        <RoomServiceForm
          roomId={room.id}
          bookingId={currentBooking.id}
          onClose={() => setShowServiceForm(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteRoom}
        onOpenChange={(open) => { if (!open) setConfirmDeleteRoom(false); }}
        title="Delete Room"
        description={`Delete Room ${room?.room_number}?`}
        consequence="The room will be deactivated and hidden from booking lists. Past bookings and history will remain."
        entity={`Room: ${room?.room_number ?? ""} (${room?.room_types?.name ?? ""})`}
        confirmLabel="Delete Room"
        onConfirm={() => {
          if (!room) return;
          deleteRoom.mutate(room.id, {
            onSuccess: () => {
              showSuccess(`Room ${room.room_number} deleted`);
              navigate("/motel");
            },
            onError: (err) => showError((err as Error)?.message || "Failed to delete room"),
          });
        }}
        isPending={deleteRoom.isPending}
      />
    </div>
  );
}
