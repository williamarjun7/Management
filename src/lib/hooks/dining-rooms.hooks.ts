import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import type { DiningRoom } from '../../types';

export function useDiningRooms() {
  return useQuery({
    queryKey: ['dining-rooms'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('dining_rooms')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DiningRoom[];
    },
  });
}

export function useCreateDiningRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; description?: string; display_order?: number }) => {
      const { data, error } = await insforge.database
        .from('dining_rooms')
        .insert([{ ...params, is_enabled: true }])
        .select()
        .single();
      if (error) throw error;
      return data as DiningRoom;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dining-rooms'] });
    },
  });
}

export function useUpdateDiningRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; name?: string; description?: string; display_order?: number; is_enabled?: boolean }) => {
      const { id, ...updates } = params;
      const { data, error } = await insforge.database
        .from('dining_rooms')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as DiningRoom;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dining-rooms'] });
    },
  });
}

export function useDeleteDiningRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('dining_rooms')
        .update({ is_enabled: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dining-rooms'] });
    },
  });
}
