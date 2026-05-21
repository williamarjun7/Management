import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { useMenuCategories, useCreateMenuItem, useUpdateMenuItem, useUpdateMenuItemImage } from "../../lib/hooks";
import { uploadImage } from "../../lib/services/upload";
import ImageUpload from "../../components/ImageUpload";
import { menuItemSchema } from "../../lib/core/validations";
import type { MenuItem } from "../../types";
import type { z } from "zod";

interface Props {
  open: boolean;
  onClose: () => void;
  item?: MenuItem | null;
  preselectedCategoryId?: string;
}

export default function MenuItemDialog({ open, onClose, item, preselectedCategoryId }: Props) {
  const { data: categories } = useMenuCategories();
  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const updateImage = useUpdateMenuItemImage();
  const saving = create.isPending || update.isPending;
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description ?? "");
      setPrice(String(item.price));
      setCategoryId(item.category_id);
      setPrepTime(item.preparation_time != null ? String(item.preparation_time) : "");
      setIsAvailable(item.is_available);
      setImageUrl(item.image_url);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setCategoryId(preselectedCategoryId ?? "");
      setPrepTime("");
      setIsAvailable(true);
      setImageUrl(null);
    }
  }, [item, preselectedCategoryId, open]);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const { url } = await uploadImage(file, "menu-items");
      setImageUrl(url);
      if (item) {
        await updateImage.mutateAsync({ id: item.id, image_url: url });
      }
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImageRemove() {
    setImageUrl(null);
    if (item) {
      await updateImage.mutateAsync({ id: item.id, image_url: null });
    }
  }

  if (!open) return null;

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = menuItemSchema.safeParse({
      name,
      description: description.trim() || undefined,
      price: price || "0",
      category_id: categoryId,
      prep_time: prepTime || undefined,
      is_available: isAvailable,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);

    const payload = { ...parsed.data, image_url: imageUrl };

    if (item) {
      const { image_url, ...rest } = payload;
      await update.mutateAsync({ id: item.id, ...rest });
    } else {
      await create.mutateAsync(payload);
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
          {item ? "Edit Menu Item" : "Add Menu Item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mi-name">Name</Label>
            <Input
              id="mi-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cappuccino"
              required
              autoFocus
            />
            {getError("name") && <p className="text-xs text-destructive">{getError("name")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mi-desc">Description (optional)</Label>
            <Input
              id="mi-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mi-price">Price (Rs.)</Label>
              <Input
                id="mi-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="9.99"
                required
              />
              {getError("price") && <p className="text-xs text-destructive">{getError("price")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-prep">Prep Time (min, optional)</Label>
              <Input
                id="mi-prep"
                type="number"
                min="0"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="15"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mi-category">Category</Label>
            <Select
              id="mi-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={
                categories?.map((c) => ({ value: c.id, label: c.name })) ?? []
              }
              placeholder="Select a category"
              required
            />
            {getError("category_id") && <p className="text-xs text-destructive">{getError("category_id")}</p>}
          </div>
          <div className="flex items-center gap-2">
            <input
              id="mi-available"
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="mi-available">Available</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !price || !categoryId}>
              {saving ? "Saving…" : item ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
