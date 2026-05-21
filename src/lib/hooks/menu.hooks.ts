import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { deleteImage as deleteStorageImage, extractStorageKeyFromUrl } from '../services/upload';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes } from '../services/audit.service';
import type { MenuCategory, MenuItem } from '../../types';
import { queryKeys } from '../core/query-keys';

const T = {
  menuCategories: 'menu_categories' as const,
  menuItems: 'menu_items' as const,
};

// ─────────────── MENU CATEGORIES ───────────────

export function useMenuCategories() {
  return useQuery({
    queryKey: queryKeys.menuCategories,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from(T.menuCategories)
        .select('*')
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw error;
      return data as MenuCategory[];
    },
  });
}

export function useCreateMenuCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data, error } = await insforge.database
        .from(T.menuCategories)
        .insert([{ name: values.name, description: values.description || null }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.MENU_CATEGORY, data.id, { new_state: { name: vars.name, description: vars.description } }));
      qc.invalidateQueries({ queryKey: queryKeys.menuCategories });
    },
  });
}

export function useUpdateMenuCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { data, error } = await insforge.database
        .from(T.menuCategories)
        .update({ name, description: description || null })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.MENU_CATEGORY, data.id, { new_state: { name: data.name, description: data.description } }));
      qc.invalidateQueries({ queryKey: queryKeys.menuCategories });
    },
  });
}

export function useDeleteMenuCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from(T.menuCategories)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.MENU_CATEGORY, id));
      qc.invalidateQueries({ queryKey: queryKeys.menuCategories });
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });
}

// ─────────────── MENU ITEMS ───────────────

export function useMenuItems(categoryId?: string) {
  return useQuery({
    queryKey: categoryId ? queryKeys.menuItemsByCategory(categoryId) : queryKeys.menuItems,
    queryFn: async () => {
      let q = insforge.database.from(T.menuItems).select('*').order('name', { ascending: true }).limit(200);
      if (categoryId) q = q.eq('category_id', categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data as MenuItem[];
    },
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string; description?: string; price: number;
      category_id: string; preparation_time?: number; is_available?: boolean;
      image_url?: string | null;
    }) => {
      const { data, error } = await insforge.database
        .from(T.menuItems)
        .insert([{
          name: values.name, description: values.description || null,
          price: values.price, category_id: values.category_id,
          preparation_time: values.preparation_time ?? null, is_available: values.is_available ?? true,
          image_url: values.image_url ?? null,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.MENU_ITEM, data.id, { new_state: { name: vars.name, price: vars.price, category_id: vars.category_id } }));
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      id: string; name: string; description?: string; price: number;
      category_id: string; preparation_time?: number; is_available?: boolean;
    }) => {
      const { id, ...rest } = values;
      const { data, error } = await insforge.database
        .from(T.menuItems)
        .update({
          name: rest.name, description: rest.description || null,
          price: rest.price, category_id: rest.category_id,
          preparation_time: rest.preparation_time ?? null, is_available: rest.is_available ?? true,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.MENU_ITEM, data.id, { new_state: { name: vars.name, price: vars.price, category_id: vars.category_id } }));
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });
}

export function useToggleMenuItemAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { data, error } = await insforge.database
        .from(T.menuItems)
        .update({ is_available })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.MENU_ITEM, data.id, { reason: `Availability set to ${data.is_available}` }));
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });
}

export function useUpdateMenuItemImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, image_url }: { id: string; image_url: string | null }) => {
      const { data, error } = await insforge.database
        .from(T.menuItems)
        .update({ image_url })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.IMAGE_UPDATE, AuditEntityTypes.MENU_ITEM, data.id, { reason: vars.image_url ? 'Image updated' : 'Image removed' }));
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, image_url }: { id: string; image_url?: string | null }) => {
      if (image_url) {
        const key = extractStorageKeyFromUrl(image_url);
        if (key) {
          await deleteStorageImage(key).catch(() => {});
        }
      }
      const { error } = await insforge.database
        .from(T.menuItems)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.MENU_ITEM, vars.id));
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });
}
