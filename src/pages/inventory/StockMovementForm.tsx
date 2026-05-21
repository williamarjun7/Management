import { useState } from "react";
import { X } from "lucide-react";
import { useProducts, useRecordStockMovement } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { stockMovementSchema } from "../../lib/core/validations";
import type { Product } from "../../types";
import type { z } from "zod";

const movementTypes = [
  { value: "purchase", label: "Purchase (Stock In)" },
  { value: "sale", label: "Sale (Stock Out)" },
  { value: "wastage", label: "Wastage" },
  { value: "adjustment", label: "Adjustment" },
  { value: "room_usage", label: "Room Usage" },
];

interface StockMovementFormProps {
  onClose: () => void;
}

export function StockMovementForm({ onClose }: StockMovementFormProps) {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState("purchase");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const recordMovement = useRecordStockMovement();

  const selectedProduct = products?.find((p: Product) => p.id === productId);

  const isDestructive = movementType === "wastage" || movementType === "adjustment";

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  function handleSubmitPress() {
    if (isDestructive) {
      setShowConfirm(true);
    } else {
      executeMovement();
    }
  }

  async function executeMovement() {
    if (!productId || !selectedProduct || !user) return;
    try {
      await recordMovement.mutateAsync({
        p_product_id: productId,
        p_movement_type: movementType,
        p_quantity: Number(quantity),
        p_unit: selectedProduct.unit,
        p_created_by: user.id,
        p_reason: reason || undefined,
      });
      showSuccess(`${movementType} recorded for ${selectedProduct.name}`);
      onClose();
    } catch (err) {
      showError((err as Error)?.message || "Failed to record stock movement");
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = stockMovementSchema.safeParse({
      product_id: productId,
      movement_type: movementType,
      quantity,
      reason: reason || undefined,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);
    handleSubmitPress();
  };

  const productOptions = products?.map((p: Product) => ({
    value: p.id,
    label: `${p.name} ${p.sku ? `(${p.sku})` : ""}`,
  })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Record Stock Movement</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product">Product *</Label>
            <Select
              id="product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              options={productOptions}
              placeholder="Select a product"
            />
            {getError("product_id") && <p className="text-xs text-destructive">{getError("product_id")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Movement Type *</Label>
            <Select
              id="type"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              options={movementTypes}
            />
            {getError("movement_type") && <p className="text-xs text-destructive">{getError("movement_type")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="qty">
              Quantity * {selectedProduct && `(${selectedProduct.unit})`}
            </Label>
            <Input
              id="qty"
              type="number"
              step="0.001"
              min="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              required
            />
            {getError("quantity") && <p className="text-xs text-destructive">{getError("quantity")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this movement happening?"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={recordMovement.isPending} className="min-h-[44px]">
              {recordMovement.isPending ? "Recording..." : "Record Movement"}
            </Button>
          </div>
        </form>

        {recordMovement.isError && (
          <p className="mt-2 text-sm text-destructive">
            {(recordMovement.error as Error)?.message || "Failed to record movement"}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={`Record ${movementType === "wastage" ? "Wastage" : "Stock Adjustment"}`}
        description={`This will record a ${movementType} of ${quantity} ${selectedProduct?.unit ?? ""} for ${selectedProduct?.name ?? ""}.`}
        consequence={
          movementType === "wastage"
            ? "Stock will be permanently deducted. This cannot be undone without a new purchase entry."
            : "Inventory balance will be modified. Verify the quantity is correct before confirming."
        }
        entity={`${selectedProduct?.name ?? ""} — ${quantity} ${selectedProduct?.unit ?? ""}`}
        confirmLabel={`Record ${movementType}`}
        confirmVariant="destructive"
        onConfirm={() => { setShowConfirm(false); executeMovement(); }}
        isPending={recordMovement.isPending}
      />
    </div>
  );
}
