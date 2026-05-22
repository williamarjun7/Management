import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRoomMappings, createRoomMapping, deleteRoomMapping,
  getSyncLogs, getSyncLog,
  getSyncQueue,
  getExternalBookings, getExternalBookingByPosId,
  pushBookingToWebsite, pushStatusUpdateToWebsite, triggerRetryQueue,
} from '../services/booking-sync';
import { queryKeys } from '../core/query-keys';

export function useRoomMappings() {
  return useQuery({
    queryKey: ['room-mappings'],
    queryFn: getRoomMappings,
  });
}

export function useCreateRoomMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRoomMapping,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-mappings'] }),
  });
}

export function useDeleteRoomMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRoomMapping,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-mappings'] }),
  });
}

export function useSyncLogs(status?: string) {
  return useQuery({
    queryKey: ['sync-logs', status],
    queryFn: () => getSyncLogs(100, status),
  });
}

export function useSyncLog(id: string | undefined) {
  return useQuery({
    queryKey: ['sync-log', id],
    enabled: !!id,
    queryFn: () => getSyncLog(id!),
  });
}

export function useSyncQueue() {
  return useQuery({
    queryKey: ['sync-queue'],
    queryFn: getSyncQueue,
    refetchInterval: 10000,
  });
}

export function useExternalBookings() {
  return useQuery({
    queryKey: ['external-bookings'],
    queryFn: getExternalBookings,
  });
}

export function useExternalBookingByPosId(posBookingId: string | undefined) {
  return useQuery({
    queryKey: ['external-booking', posBookingId],
    enabled: !!posBookingId,
    queryFn: () => getExternalBookingByPosId(posBookingId!),
  });
}

export function usePushBookingToWebsite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pushBookingToWebsite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-logs'] });
      qc.invalidateQueries({ queryKey: ['external-bookings'] });
    },
  });
}

export function usePushStatusUpdateToWebsite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pushStatusUpdateToWebsite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-logs'] });
    },
  });
}

export function useTriggerRetryQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerRetryQueue,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-queue'] });
      qc.invalidateQueries({ queryKey: ['sync-logs'] });
    },
  });
}
