import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes } from '../services/audit.service';
import type { RestaurantTable, TableSession, WorkflowState } from '../../types';
import { queryKeys } from '../core/query-keys';

const T = {
  tables: 'restaurant_tables' as const,
};

// ─────────────── TABLES ───────────────

export function useTables() {
  return useQuery({
    queryKey: queryKeys.tables,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from(T.tables)
        .select('*');
      if (error) throw error;
      return ((data ?? []) as RestaurantTable[]).sort(
        (a, b) => Number(a.table_number) - Number(b.table_number)
      );
    },
  });
}

// ─────────────── TABLE SESSIONS ───────────────

export function useActiveTableSession(tableId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activeTableSession(tableId ?? ''),
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('table_sessions')
        .select('*')
        .eq('table_id', tableId)
        .eq('status', 'active')
        .single();
      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data as TableSession;
    },
  });
}

export function useCreateTableSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { table_id: string; staff_id: string }) => {
      const { data, error } = await insforge.database
        .from('table_sessions')
        .insert([{ table_id: params.table_id, staff_id: params.staff_id, status: 'active' }])
        .select()
        .single();
      if (error) throw error;
      return data as TableSession;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.TABLE_SESSION, data.id, { new_state: { table_id: data.table_id, staff_id: data.staff_id, status: 'active' }, event_type: 'TABLE_SESSION_STARTED' }));
      qc.invalidateQueries({ queryKey: queryKeys.tableSessions });
    },
  });
}

export function useCloseTableSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await insforge.database
        .from('table_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.TABLE_SESSION, data.id, { new_state: { status: 'closed' }, event_type: 'TABLE_SESSION_CLOSED' }));
      qc.invalidateQueries({ queryKey: queryKeys.tableSessions });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
}

// ─────────────── WORKFLOW STATE ───────────────

export function useWorkflowForEntity(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflowForEntity(entityType, entityId ?? ''),
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('workflow_state')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('status', 'active')
        .single();
      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data as WorkflowState;
    },
  });
}

export function useUpdateWorkflowStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      workflowId: string;
      step: string;
      context?: Record<string, unknown>;
    }) => {
      const { data, error } = await insforge.database
        .from('workflow_state')
        .update({ current_step: params.step, context: params.context ?? {}, updated_at: new Date().toISOString() })
        .eq('id', params.workflowId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.WORKFLOW, data.id, { new_state: { current_step: vars.step }, event_type: 'WORKFLOW_STEP_CHANGED' }));
      qc.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}
