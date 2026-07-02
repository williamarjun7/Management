import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerSystemSync } from '../services/system-sync.service';
import type { SystemSyncReport } from '../services/system-sync.service';

export function useSystemSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { performed_by?: string }) => {
      const result = await triggerSystemSync(input?.performed_by);
      if (result.error) throw new Error(result.error);
      return result.data as { report: SystemSyncReport };
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}
