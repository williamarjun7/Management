import { useState } from "react";
import { X } from "lucide-react";
import { useCreateProduct, useUpdateProduct } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { showSuccess, showError } from "../../components/ui/toast";
import { productSchema } from "../../lib/core/validations";
import type { Product } from "../../types";
import type { z } from "zod";

const units = [
  { value: "g", label: "Grams (g)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "l", label: "Liters (L)" },
  { value: "pcs", label: "Pieces" },
  { value: "units", label: "Units" },
  { value: "boxes", label: "Boxes" },
  { value: "packs", label: "Packs" },
];

interface ProductFormProps {
  product?: Product;
  onClose: () => void;
}

export function ProductForm({ product, onClose }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "g");
  const [reorderLevel, setReorderLevel] = useState(
    product?.reorder_level ? String(product.reorder_level) : ""
  );
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse({
      name,
      sku: sku || undefined,
      category: category || undefined,
      unit,
      reorder_level: reorderLevel || undefined,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);
    try {
      if (product) {
        await updateProduct.mutateAsync({ id: product.id, ...parsed.data });
        showSuccess(`Product "${name}" updated`);
      } else {
        await createProduct.mutateAsync(parsed.data);
        showSuccess(`Product "${name}" created`);
      }
      onClose();
    } catch (err) {
      showError((err as Error)?.message || "Failed to save product");
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;
  const error = createProduct.error || updateProduct.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{product ? "Edit Product" : "Add Product"}</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., All-Purpose Flour"
              required
            />
            {getError("name") && <p className="text-xs text-destructive">{getError("name")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Optional SKU code"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Dry Goods, Produce, Dairy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Unit *</Label>
            <Select
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              options={units}
            />
            {getError("unit") && <p className="text-xs text-destructive">{getError("unit")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reorder">Reorder Level</Label>
            <Input
              id="reorder"
              type="number"
              step="0.001"
              min="0"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              placeholder="Alert when stock falls below"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="min-h-[44px]">
              {isPending ? "Saving..." : product ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </form>

        {error && (
          <p className="mt-2 text-sm text-destructive">
            {(error as Error)?.message || "Error saving product"}
          </p>
        )}
      </div>
    </div>
  );
}
