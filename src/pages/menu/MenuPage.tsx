import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { BottomSheet } from "../../components/ui/bottom-sheet";
import { useAuth } from "../../lib/core/auth-context";
import {
  useMenuCategories,
  useMenuItems,
  useDeleteMenuCategory,
  useToggleMenuItemAvailability,
  useDeleteMenuItem,
} from "../../lib/hooks";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { List, Plus, X } from "lucide-react";
import type { MenuCategory, MenuItem } from "../../types";
import MenuCategoryDialog from "./MenuCategoryDialog";
import MenuItemDialog from "./MenuItemDialog";

export default function MenuPage() {
  const { user } = useAuth();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);

  const { data: categories, isLoading: catsLoading } = useMenuCategories();
  const { data: items, isLoading: itemsLoading } = useMenuItems(selectedCategoryId ?? undefined);
  const deleteCategory = useDeleteMenuCategory();
  const toggleAvailability = useToggleMenuItemAvailability();
  const deleteItem = useDeleteMenuItem();

  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<MenuCategory | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<MenuItem | null>(null);

  function openAddCategory() {
    setEditingCategory(null);
    setCatDialogOpen(true);
  }

  function openEditCategory(cat: MenuCategory) {
    setEditingCategory(cat);
    setCatDialogOpen(true);
  }

  function openAddItem() {
    setEditingItem(null);
    setItemDialogOpen(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    setItemDialogOpen(true);
  }

  function selectCategory(id: string | null) {
    setSelectedCategoryId(id);
    setMobileCatOpen(false);
  }

  const CategoryList = ({ onSelect }: { onSelect: (id: string | null) => void }) => (
    <ul className="space-y-1">
      <li>
        <button
          onClick={() => onSelect(null)}
          className={`w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
            selectedCategoryId === null ? "bg-accent font-medium" : ""
          }`}
        >
          All Items
        </button>
      </li>
      {(categories ?? []).map((cat) => (
        <li key={cat.id} className="group flex items-center">
          <button
            onClick={() => onSelect(cat.id)}
            className={`flex-1 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
              selectedCategoryId === cat.id ? "bg-accent font-medium" : ""
            }`}
          >
            {cat.name}
          </button>
          {isAdminOrManager && (
            <div className="hidden shrink-0 gap-0.5 pr-1 group-hover:flex">
              <button
                onClick={() => openEditCategory(cat)}
                className="rounded p-1.5 text-xs text-muted-foreground hover:bg-accent min-h-[36px] min-w-[36px]"
                title="Edit"
              >
                ✎
              </button>
              <button
                onClick={() => setConfirmDeleteCategory(cat)}
                className="rounded p-1.5 text-xs text-destructive hover:bg-accent min-h-[36px] min-w-[36px]"
                title="Delete"
              >
                ✕
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full gap-4 md:gap-6 flex-col lg:flex-row">
      {/* Mobile category trigger */}
      <div className="flex items-center justify-between lg:hidden">
        <h1 className="text-lg font-semibold">
          {selectedCategoryId
            ? categories?.find((c) => c.id === selectedCategoryId)?.name ?? "Menu Items"
            : "All Menu Items"}
        </h1>
        <div className="flex items-center gap-2">
          {isAdminOrManager && (
            <Button size="sm" onClick={openAddItem}>
              + Add Item
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileCatOpen(true)}
            className="flex items-center gap-1.5"
          >
            <List className="h-4 w-4" />
            Categories
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categories</h2>
          {isAdminOrManager && (
            <Button size="sm" onClick={openAddCategory}>
              + Add
            </Button>
          )}
        </div>

        {catsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <CategoryList onSelect={selectCategory} />
        )}
      </aside>

      {/* Mobile category bottom sheet */}
      <BottomSheet open={mobileCatOpen} onClose={() => setMobileCatOpen(false)} title="Categories">
        <div className="flex items-center justify-between mb-3">
          {isAdminOrManager && (
            <Button size="sm" onClick={() => { openAddCategory(); setMobileCatOpen(false); }}>
              + Add Category
            </Button>
          )}
        </div>
        {catsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <CategoryList onSelect={selectCategory} />
        )}
      </BottomSheet>

      {/* Main */}
      <main className="flex-1 min-h-0">
        <div className="hidden lg:flex mb-4 items-center justify-between">
          <h2 className="text-lg font-semibold">
            {selectedCategoryId
              ? categories?.find((c) => c.id === selectedCategoryId)?.name ?? "Menu Items"
              : "All Menu Items"}
          </h2>
          {isAdminOrManager && (
            <Button size="sm" onClick={openAddItem}>
              + Add Item
            </Button>
          )}
        </div>

        {itemsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No menu items yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(items ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                {item.image_url && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
                <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={item.is_available ? "success" : "destructive"}>
                    {item.is_available ? "Available" : "Unavailable"}
                  </Badge>
                </div>

                <div className="mb-3 flex items-center gap-3 text-sm">
                  <span className="font-medium">Rs. {item.price.toFixed(2)}</span>
                  {item.preparation_time != null && (
                    <span className="text-muted-foreground">
                      Prep: {item.preparation_time} min
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isAdminOrManager && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditItem(item)}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toggleAvailability.mutate({
                        id: item.id,
                        is_available: !item.is_available,
                      })
                    }
                  >
                    {item.is_available ? "Disable" : "Enable"}
                  </Button>
                  {isAdminOrManager && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDeleteItem(item)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <MenuCategoryDialog
        open={catDialogOpen}
        onClose={() => setCatDialogOpen(false)}
        category={editingCategory}
      />

      <MenuItemDialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        item={editingItem}
        preselectedCategoryId={selectedCategoryId ?? undefined}
      />

      <ConfirmDialog
        open={confirmDeleteCategory !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteCategory(null); }}
        title="Delete Category"
        description={`Delete "${confirmDeleteCategory?.name}" and all its menu items?`}
        consequence="All menu items in this category will also be permanently deleted. This action cannot be undone."
        entity={`Category: ${confirmDeleteCategory?.name ?? ""}`}
        confirmLabel="Delete Category"
        onConfirm={() => {
          if (!confirmDeleteCategory) return;
          deleteCategory.mutate(confirmDeleteCategory.id, {
            onSuccess: () => {
              showSuccess(`Category "${confirmDeleteCategory.name}" deleted`);
              setConfirmDeleteCategory(null);
            },
            onError: (err) => showError((err as Error)?.message || "Failed to delete category"),
          });
        }}
        isPending={deleteCategory.isPending}
      />

      <ConfirmDialog
        open={confirmDeleteItem !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteItem(null); }}
        title="Delete Menu Item"
        description={`Delete "${confirmDeleteItem?.name}"?`}
        consequence="This menu item will be permanently removed. It will no longer appear in menus, orders, or POS."
        entity={`Menu Item: ${confirmDeleteItem?.name ?? ""}`}
        confirmLabel="Delete Item"
        onConfirm={() => {
          if (!confirmDeleteItem) return;
          deleteItem.mutate(
            { id: confirmDeleteItem.id, image_url: confirmDeleteItem.image_url },
            {
              onSuccess: () => {
                showSuccess(`"${confirmDeleteItem.name}" deleted`);
                setConfirmDeleteItem(null);
              },
              onError: (err) => showError((err as Error)?.message || "Failed to delete item"),
            }
          );
        }}
        isPending={deleteItem.isPending}
      />
    </div>
  );
}
