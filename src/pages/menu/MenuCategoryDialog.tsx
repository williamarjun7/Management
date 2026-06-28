import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useCreateMenuCategory, useUpdateMenuCategory } from "../../lib/hooks";
import { menuCategorySchema } from "../../lib/core/validations";
import type { MenuCategory } from "../../types";
import type { z } from "zod";

interface Props {
  open: boolean;
  onClose: () => void;
  category?: MenuCategory | null;
}

export default function MenuCategoryDialog({ open, onClose, category }: Props) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [errors, setErrors] = useState<z.ZodIssue[]>([]);
  const create = useCreateMenuCategory();
  const update = useUpdateMenuCategory();
  const saving = create.isPending || update.isPending;

  if (!open) return null;

  function getError(field: string) {
    return errors.find((e) => e.path[0] === field)?.message;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = menuCategorySchema.safeParse({
      name,
      description: description || undefined,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues);
      return;
    }
    setErrors([]);

    if (category) {
      await update.mutateAsync({ id: category.id, ...parsed.data });
    } else {
      await create.mutateAsync(parsed.data);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="menu-category-dialog-title">
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="menu-category-dialog-title" className="mb-4 text-lg font-semibold">
          {category ? "Edit Category" : "Add Category"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Beverages"
              required
              autoFocus
            />
            {getError("name") && <p className="text-xs text-destructive">{getError("name")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description (optional)</Label>
            <Input
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : category ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
