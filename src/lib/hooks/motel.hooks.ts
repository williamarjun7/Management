import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { logger } from '../services/logger';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes, AuditEventTypes } from '../services/audit.service';
import type { Room, RoomType, Booking, HousekeepingTask, MaintenanceTask } from '../../types';
import { queryKeys } from '../core/query-keys';

// ─────────────── ROOMS ───────────────

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('rooms')
        .select('*, room_types(*)')
        .eq('is_active', true)
        .order('room_number', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });
}

export function useRoom(id: string | undefined) {
  return useQuery({
    queryKey: ['room', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('rooms')
        .select('*, room_types(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Room;
    },
  });
}

export function useRoomTypes() {
  return useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('room_types')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoomType[];
    },
  });
}

// ─────────────── BOOKINGS ───────────────

export function useBookings(status?: string) {
  return useQuery({
    queryKey: ['bookings', status],
    queryFn: async () => {
      let query = insforge.database
        .from('bookings')
        .select('*, rooms(*, room_types(*)), room_services(*)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: ['booking', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('bookings')
        .select('*, rooms(*, room_types(*)), room_services(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Booking;
    },
  });
}

export function useTodayBookings() {
  return useQuery({
    queryKey: ['today-bookings'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString();
      const { data, error } = await insforge.database
        .from('bookings')
        .select('*, rooms(*, room_types(*))')
        .gte('check_in', today)
        .lt('check_in', tomorrow)
        .order('check_in', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });
}

// ─────────────── ROOM OPERATIONS (RPC ONLY) ───────────────

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_booking_id: string;
      p_user_id: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('process_check_in', params);
      if (error) {
        logger.error('check_in_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'process_check_in',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CHECK_IN, AuditEntityTypes.BOOKING, vars.p_booking_id, { event_type: AuditEventTypes.CHECK_IN }));
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['today-bookings'] });
    },
  });
}

export function useCheckOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_booking_id: string;
      p_user_id: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('process_check_out', params);
      if (error) {
        logger.error('check_out_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'process_check_out',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CHECK_OUT, AuditEntityTypes.BOOKING, vars.p_booking_id, { event_type: AuditEventTypes.CHECK_OUT }));
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['today-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

// ─────────────── BOOKING CRUD ───────────────

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (booking: {
      room_id: string; guest_name: string; guest_phone?: string;
      guest_email?: string; guest_id_proof?: string; check_in: string;
      check_out: string; adults: number; children: number;
      nightly_rate: number; total_amount: number; notes?: string;
      created_by?: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await insforge.database.rpc('create_booking', {
        p_room_id: booking.room_id,
        p_guest_name: booking.guest_name,
        p_guest_phone: booking.guest_phone || null,
        p_guest_email: booking.guest_email || null,
        p_guest_id_proof: booking.guest_id_proof || null,
        p_check_in: booking.check_in,
        p_check_out: booking.check_out,
        p_adults: booking.adults,
        p_children: booking.children,
        p_nightly_rate: booking.nightly_rate,
        p_total_amount: booking.total_amount,
        p_notes: booking.notes || null,
        p_created_by: booking.created_by || null,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        logger.error('create_booking_failed', 'hooks', {
          metadata: { guest_name: booking.guest_name, room_id: booking.room_id, error: (error as Error)?.message },
          operation: 'create_booking',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
      queryClient.invalidateQueries({ queryKey: ['today-bookings'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.BOOKING, id, { reason: 'Booking cancelled' }));
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
      queryClient.invalidateQueries({ queryKey: ['today-bookings'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useCreateRoomService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (service: {
      booking_id: string; room_id: string; description: string;
      quantity: number; unit_price: number; total: number; service_type: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await insforge.database.rpc('create_room_service', {
        p_booking_id: service.booking_id,
        p_room_id: service.room_id,
        p_description: service.description,
        p_quantity: service.quantity,
        p_unit_price: service.unit_price,
        p_total: service.total,
        p_service_type: service.service_type,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        logger.error('create_room_service_failed', 'hooks', {
          metadata: { booking_id: service.booking_id, service_type: service.service_type, error: (error as Error)?.message },
          operation: 'create_room_service',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (data, variables) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.ROOM_SERVICE, data?.service_id ?? variables.booking_id, { new_state: { description: variables.description, quantity: variables.quantity, service_type: variables.service_type } }));
      queryClient.invalidateQueries({ queryKey: ['booking', variables.booking_id] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ─────────────── ROOM CRUD (direct DB) ───────────────

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      room_number: string; room_type_id: string; floor?: string;
      notes?: string; image_url?: string | null;
    }) => {
      const { data, error } = await insforge.database
        .from('rooms')
        .insert([{
          room_number: values.room_number,
          room_type_id: values.room_type_id,
          floor: values.floor || null,
          notes: values.notes || null,
          image_url: values.image_url ?? null,
          status: 'available',
          is_active: true,
        }])
        .select('*, room_types(*)')
        .single();
      if (error) throw error;
      return data as Room;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.ROOM, (data as Room).id, { new_state: { room_number: (data as Room).room_number, room_type_id: (data as Room).room_type_id } }));
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      id: string; room_number?: string; room_type_id?: string;
      floor?: string; notes?: string; image_url?: string | null;
    }) => {
      const { id, ...rest } = values;
      const updateData: Record<string, unknown> = {};
      if (rest.room_number !== undefined) updateData.room_number = rest.room_number;
      if (rest.room_type_id !== undefined) updateData.room_type_id = rest.room_type_id;
      if (rest.floor !== undefined) updateData.floor = rest.floor || null;
      if (rest.notes !== undefined) updateData.notes = rest.notes || null;
      if (rest.image_url !== undefined) updateData.image_url = rest.image_url;

      const { data, error } = await insforge.database
        .from('rooms')
        .update(updateData)
        .eq('id', id)
        .select('*, room_types(*)')
        .single();
      if (error) throw error;
      return data as Room;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.ROOM, (data as Room).id, { new_state: { room_number: (data as Room).room_number } }));
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useUpdateRoomStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await insforge.database.rpc('update_room_status', {
        p_room_id: id,
        p_new_status: status,
        p_reason: reason || 'Manual update',
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        logger.error('update_room_status_failed', 'hooks', {
          metadata: { room_id: id, new_status: status, error: (error as Error)?.message },
          operation: 'update_room_status',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('rooms')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.ROOM, id));
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useUpdateRoomTypeImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, image_url }: { id: string; image_url: string | null }) => {
      const { data, error } = await insforge.database
        .from('room_types')
        .update({ image_url })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.IMAGE_UPDATE, AuditEntityTypes.ROOM_TYPE, data.id, { reason: vars.image_url ? 'Room type image updated' : 'Room type image removed' }));
      qc.invalidateQueries({ queryKey: queryKeys.roomTypes });
    },
  });
}

export function useUpdateRoomImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, image_url }: { id: string; image_url: string | null }) => {
      const { data, error } = await insforge.database
        .from('rooms')
        .update({ image_url })
        .eq('id', id)
        .select('*, room_types(*)')
        .single();
      if (error) throw error;
      return data as Room;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.IMAGE_UPDATE, AuditEntityTypes.ROOM, (data as Room).id, { reason: vars.image_url ? 'Room image updated' : 'Room image removed' }));
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

// ─────────────── BOOKING CALENDAR ───────────────

export function useBookingCalendar(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['booking-calendar', startDate, endDate],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const start = startDate ?? today;
      const end = endDate ?? new Date(new Date(start).getTime() + 30 * 86400000).toISOString().split('T')[0];
      const { data, error } = await insforge.database
        .from('bookings')
        .select('*, rooms(*)')
        .gte('check_in', start)
        .lte('check_out', end)
        .order('check_in', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as (Booking & { rooms: Room })[];
    },
  });
}

// ─────────────── HOUSEKEEPING ───────────────

export function useHousekeepingSchedule(date?: string) {
  return useQuery({
    queryKey: ['housekeeping', date],
    queryFn: async () => {
      const targetDate = date ?? new Date().toISOString().split('T')[0];
      const nextDay = new Date(new Date(targetDate).getTime() + 86400000).toISOString();
      const { data, error } = await insforge.database
        .from('housekeeping_tasks')
        .select('*, rooms(*)')
        .gte('created_at', targetDate)
        .lt('created_at', nextDay)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as (HousekeepingTask & { rooms: Room })[];
    },
  });
}

export function useAssignHousekeeping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_room_id: string;
      p_assigned_to: string;
      p_task_type?: string;
      p_priority?: string;
      p_notes?: string;
      p_created_by?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('assign_housekeeping', {
        ...params,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        logger.error('assign_housekeeping_failed', 'hooks', {
          metadata: { room_id: params.p_room_id, assigned_to: params.p_assigned_to, error: (error as Error)?.message },
          operation: 'assign_housekeeping',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.ROOM, vars.p_room_id, { reason: 'Housekeeping assigned' }));
      qc.invalidateQueries({ queryKey: queryKeys.housekeeping });
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useCompleteHousekeeping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_task_id: string;
      p_completed_by: string;
    }) => {
      const { data, error } = await insforge.database.rpc('complete_housekeeping', {
        ...params,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        logger.error('complete_housekeeping_failed', 'hooks', {
          metadata: { task_id: params.p_task_id, error: (error as Error)?.message },
          operation: 'complete_housekeeping',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.ROOM, vars.p_task_id, { reason: 'Housekeeping completed' }));
      qc.invalidateQueries({ queryKey: queryKeys.housekeeping });
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

// ─────────────── MAINTENANCE ───────────────

export function useMaintenanceSchedule(date?: string) {
  return useQuery({
    queryKey: ['maintenance', date],
    queryFn: async () => {
      const targetDate = date ?? new Date().toISOString().split('T')[0];
      const nextDay = new Date(new Date(targetDate).getTime() + 86400000).toISOString();
      const { data, error } = await insforge.database
        .from('maintenance_tasks')
        .select('*, rooms(*)')
        .gte('created_at', targetDate)
        .lt('created_at', nextDay)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as (MaintenanceTask & { rooms: Room })[];
    },
  });
}

export function useScheduleMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_room_id?: string;
      p_asset_type?: string;
      p_description: string;
      p_priority?: string;
      p_notes?: string;
      p_reported_by?: string;
      p_assigned_to?: string;
      p_estimated_cost?: number;
    }) => {
      const { data, error } = await insforge.database.rpc('schedule_maintenance', {
        ...params,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        logger.error('schedule_maintenance_failed', 'hooks', {
          metadata: { description: params.p_description, error: (error as Error)?.message },
          operation: 'schedule_maintenance',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.SYSTEM_EVENT, vars.p_room_id ?? 'unknown', { reason: 'Maintenance scheduled: ' + vars.p_description }));
      qc.invalidateQueries({ queryKey: queryKeys.maintenance });
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

export function useCompleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_task_id: string;
      p_actual_cost?: number;
      p_notes?: string;
      p_completed_by?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('complete_maintenance', {
        ...params,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        logger.error('complete_maintenance_failed', 'hooks', {
          metadata: { task_id: params.p_task_id, error: (error as Error)?.message },
          operation: 'complete_maintenance',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.SYSTEM_EVENT, vars.p_task_id, { reason: 'Maintenance completed' }));
      qc.invalidateQueries({ queryKey: queryKeys.maintenance });
      qc.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

// ─────────────── RECURRING GUESTS ───────────────

export function useRecurringGuests(minStays = 2) {
  return useQuery({
    queryKey: ['recurring-guests', minStays],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('bookings')
        .select('guest_name, guest_phone, guest_email, booking_number, check_in, check_out, status, total_amount, id')
        .in('status', ['checked_out', 'checked_in'])
        .order('guest_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      const guestMap: Record<string, { name: string; phone: string | null; email: string | null; stays: number; totalSpent: number; lastStay: string; firstStay: string; bookingIds: string[] }> = {};
      (data ?? []).forEach((b: { guest_name: string; guest_phone: string | null; guest_email: string | null; check_in: string; total_amount: number; id: string }) => {
        const key = b.guest_email ?? b.guest_phone ?? b.guest_name;
        if (!guestMap[key]) {
          guestMap[key] = { name: b.guest_name, phone: b.guest_phone, email: b.guest_email, stays: 0, totalSpent: 0, lastStay: b.check_in, firstStay: b.check_in, bookingIds: [] };
        }
        guestMap[key].stays++;
        guestMap[key].totalSpent += Number(b.total_amount);
        if (b.check_in > guestMap[key].lastStay) guestMap[key].lastStay = b.check_in;
        if (b.check_in < guestMap[key].firstStay) guestMap[key].firstStay = b.check_in;
        guestMap[key].bookingIds.push(b.id);
      });
      return Object.values(guestMap)
        .filter(g => g.stays >= minStays)
        .sort((a, b) => b.stays - a.stays);
    },
  });
}
