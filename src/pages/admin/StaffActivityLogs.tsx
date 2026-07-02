import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { insforge } from '../../lib/core/insforge';
import type { AuditLog, UserProfile } from '../../types';
import { Clock, Filter, Search, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 50;

export default function StaffActivityLogs() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);

  const { data: logs, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['staff-activity'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AuditLog[];
    },
    refetchInterval: 30_000,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['user-profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('user_profiles')
        .select('id, name, email');
      if (error) throw error;
      return (data ?? []) as Pick<UserProfile, 'id' | 'name' | 'email'>[];
    },
    staleTime: 300_000,
  });

  useEffect(() => {
    if (isError && queryError) {
      setError((queryError as Error)?.message || 'Failed to load activity logs');
    } else {
      setError(null);
    }
  }, [isError, queryError]);

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  const availableActions = [...new Set((logs ?? []).map((l) => l.action))].sort();

  const resetPagination = useCallback(() => {
    setDisplayCount(PAGE_SIZE);
  }, []);

  const filtered = (logs ?? []).filter((log) => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (search) {
      const user = userMap.get(log.user_id || '');
      const q = search.toLowerCase();
      if (user?.name?.toLowerCase().includes(q)) return true;
      if (user?.email?.toLowerCase().includes(q)) return true;
      if (log.action.toLowerCase().includes(q)) return true;
      if (log.entity_type.toLowerCase().includes(q)) return true;
      if (log.entity_id?.toLowerCase().includes(q)) return true;
      if (log.reason?.toLowerCase().includes(q)) return true;
      return false;
    }
    return true;
  });

  const displayed = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getInitial = (user: Pick<UserProfile, 'id' | 'name' | 'email'> | undefined) => {
    if (user?.name) return user.name.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return '?';
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 border-t-4 border-t-amber-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-amber-600 dark:text-amber-400">Staff Activity Logs</h1>
          <p className="text-sm text-muted-foreground">Track all staff actions across the system</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPagination(); }}
              className="bg-transparent outline-none w-full sm:w-40 text-sm"
              aria-label="Search logs"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <button
          onClick={() => { setActionFilter('all'); resetPagination(); }}
          className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            actionFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
          aria-pressed={actionFilter === 'all'}
        >
          All
        </button>
        {availableActions.slice(0, 24).map((action) => (
          <button
            key={action}
            onClick={() => { setActionFilter(action); resetPagination(); }}
            className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              actionFilter === action ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
            aria-pressed={actionFilter === action}
          >
            {action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filtered.length} log{filtered.length !== 1 ? 's' : ''}
          {displayCount < filtered.length && ` (showing ${displayCount})`}
        </p>
      </div>

      {isLoading || usersLoading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-muted-foreground animate-pulse">Loading activity logs...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-destructive/30">
          <div className="text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive font-medium">Failed to load activity logs</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
          <p className="text-muted-foreground">No activity logs found</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {displayed.map((log) => {
              const user = userMap.get(log.user_id || '');
              return (
                <div key={log.id} className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">
                      {getInitial(user)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{user?.name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">{user?.email || ''}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground">{log.action}</span>
                      <span className="text-xs text-muted-foreground">{log.entity_type}</span>
                      {log.entity_id && (
                        <span className="text-[10px] font-mono text-muted-foreground/60">
                          #{log.entity_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    {log.reason && (
                      <p className="text-sm text-muted-foreground mt-1">{log.reason}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTime(log.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length))}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Show more ({filtered.length - displayCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
