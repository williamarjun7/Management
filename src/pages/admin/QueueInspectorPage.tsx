import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getMutationQueue, getQueueHealth, retryFailedMutation, clearCompletedMutations, getReplayCheckpoint, setReplayCheckpoint } from '../../lib/services/mutation-queue';
import { getChannelHealth, getReconnectCount, clearSeenEvents } from '../../lib/services/realtime';
import type { QueueHealthMetrics } from '../../lib/services/mutation-queue';
import type { MutationQueueItem } from '../../types';
import { RefreshCw, RotateCcw, Trash2, Eye, EyeOff, AlertTriangle, Wifi, Radio, Server, Clock, Activity, Zap, Skull } from 'lucide-react';

type SortField = 'createdAt' | 'status' | 'operation' | 'retryCount';
type SortDir = 'asc' | 'desc';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch { return iso; }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-secondary text-secondary-foreground',
    processing: 'bg-accent text-accent-foreground',
    completed: 'bg-primary text-primary-foreground',
    failed: 'bg-destructive text-destructive-foreground',
    dead: 'bg-muted text-muted-foreground',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
}

export default function QueueInspectorPage() {
  const [items, setItems] = useState<MutationQueueItem[]>([]);
  const [health, setHealth] = useState<QueueHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [channelHealth, setChannelHealth] = useState(getChannelHealth());
  const [reconnectCount, setReconnectCount] = useState(getReconnectCount());

  const refresh = useCallback(async () => {
    setLoading(true);
    const [queueItems, queueHealth] = await Promise.all([
      getMutationQueue(),
      getQueueHealth(),
    ]);
    setItems(queueItems as unknown as MutationQueueItem[]);
    setHealth(queueHealth);
    setChannelHealth(getChannelHealth());
    setReconnectCount(getReconnectCount());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRetry = async (id: string) => {
    await retryFailedMutation(id);
    refresh();
  };

  const handleClearCompleted = async () => {
    await clearCompletedMutations();
    refresh();
  };

  const handleResetReplayCheckpoint = () => {
    setReplayCheckpoint('');
    refresh();
  };

  const handleClearSeenEvents = () => {
    clearSeenEvents();
    refresh();
  };

  const sorted = [...items]
    .filter(i => filterStatus === 'all' || i.status === filterStatus)
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortField === 'operation') cmp = a.operation.localeCompare(b.operation);
      else cmp = a.retryCount - b.retryCount;
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const replayCheckpoint = getReplayCheckpoint();

  const statusCounts = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 border-t-4 border-t-red-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">Queue Inspector</h1>
          <p className="text-sm text-muted-foreground">Inspect mutation queue, dead letters, and realtime channel health</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {health && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Server className="h-3 w-3" /> Total
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-2xl font-bold">{health.queueSize}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Pending
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-2xl font-bold text-amber-500">{health.pendingCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-2xl font-bold text-primary">{health.processingCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Skull className="h-3 w-3" /> Dead
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-2xl font-bold text-gray-500">{health.deadLetterCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Failed
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-2xl font-bold text-destructive">{health.failedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" /> Throughput
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-2xl font-bold">{health.throughputPerMinute}/m</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Queue Items</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label="Filter by status"
                  >
                    <option value="all">All ({items.length})</option>
                    <option value="pending">Pending ({statusCounts['pending'] || 0})</option>
                    <option value="processing">Processing ({statusCounts['processing'] || 0})</option>
                    <option value="completed">Completed ({statusCounts['completed'] || 0})</option>
                    <option value="failed">Failed ({statusCounts['failed'] || 0})</option>
                    <option value="dead">Dead ({statusCounts['dead'] || 0})</option>
                  </select>
                  <Button variant="ghost" size="sm" onClick={handleClearCompleted} aria-label="Clear completed items">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear Done
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto">
                {sorted.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {loading ? 'Loading...' : 'No queue items'}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr className="border-b">
                        {(['status', 'operation', 'createdAt', 'retryCount'] as SortField[]).map(field => (
                          <th
                            key={field}
                            className="text-left p-2 font-medium text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                            onClick={() => {
                              if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                              else { setSortField(field); setSortDir('asc'); }
                            }}
                          >
                            {field === 'createdAt' ? 'Created' : field.charAt(0).toUpperCase() + field.slice(1)}
                            {sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                          </th>
                        ))}
                        <th className="text-left p-2 font-medium text-xs text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(item => (
                        <>
                          <tr key={item.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} tabIndex={0} role="button" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expandedId === item.id ? null : item.id); } }}>
                            <td className="p-2">
                              <Badge variant="outline" className={`text-xs ${statusBadge(item.status)}`}>
                                {item.status}
                              </Badge>
                            </td>
                            <td className="p-2 font-mono text-xs">{item.operation}</td>
                            <td className="p-2 text-xs text-muted-foreground">{formatTime(item.createdAt)}</td>
                            <td className="p-2 text-xs">{item.retryCount}</td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                {expandedId === item.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                {(item.status === 'failed' || item.status === 'dead') && (
                                  <button aria-label="Retry failed mutation" onClick={e => { e.stopPropagation(); handleRetry(item.id); }}>
                                    <RotateCcw className="h-3 w-3 text-primary" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandedId === item.id && (
                            <tr key={`${item.id}-detail`}>
                              <td colSpan={5} className="p-3 bg-muted/20 border-b">
                                <div className="space-y-1 text-xs font-mono">
                                  <div><span className="text-muted-foreground">ID:</span> {item.id}</div>
                                  <div><span className="text-muted-foreground">Idempotency:</span> {item.idempotencyKey}</div>
                                  <div><span className="text-muted-foreground">Retries:</span> {item.retryCount}</div>
                                  <div><span className="text-muted-foreground">Last Error:</span> {item.lastError || '—'}</div>
                                  <div><span className="text-muted-foreground">Params:</span>
                                    <pre className="mt-1 p-2 rounded bg-muted overflow-x-auto">{JSON.stringify(item.params, null, 2)}</pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Channel Health
              </CardTitle>
              <CardDescription>{channelHealth.length} active channels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {channelHealth.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active channels</p>
              ) : (
                channelHealth.map((ch, i) => (
                  <div key={i} className="text-sm space-y-1 p-2 rounded bg-muted/30">
                    <div className="flex justify-between">
                      <span className="font-medium">{ch.key || `Channel ${i + 1}`}</span>
                      <Badge variant="outline" className="text-xs">{ch.errorCount > 0 ? 'degraded' : 'active'}</Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>📨 {ch.messageCount}</span>
                      <span>⚠ {ch.errorCount}</span>
                      {ch.lastMessageAt && <span>🕐 {formatTime(new Date(ch.lastMessageAt).toISOString())}</span>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Replay & Dedup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reconnects (total)</span>
                <span className="font-mono font-bold">{reconnectCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Replay Checkpoint</span>
                <span className="font-mono text-xs truncate max-w-[140px]">{replayCheckpoint || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Idempotency Keys</span>
                <span className="font-mono">{health?.processedIdempotencyCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Processing Locks</span>
                <span className="font-mono">{health?.processingLockCount ?? 0}</span>
              </div>
              <div className="pt-2 space-y-2">
                <Button variant="outline" size="sm" className="w-full" onClick={handleResetReplayCheckpoint}>
                  <RotateCcw className="h-3 w-3 mr-2" />
                  Reset Replay Checkpoint
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={handleClearSeenEvents}>
                  <Trash2 className="h-3 w-3 mr-2" />
                  Clear Seen Events
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Processing</span>
                <span className="font-mono">{health ? formatMs(health.avgProcessingTimeMs) : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Oldest Item</span>
                <span className="font-mono">{health ? formatMs(health.oldestItemAgeMs) : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Drain</span>
                <span className="font-mono text-xs">{health?.lastDrainTimestamp ? formatTime(health.lastDrainTimestamp) : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Drain Duration</span>
                <span className="font-mono">{health?.lastDrainDurationMs ? formatMs(health.lastDrainDurationMs) : '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Retry Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {health && Object.keys(health.retryDistribution).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(health.retryDistribution)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([retries, count]) => (
                      <div key={retries} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{retries} retries</span>
                        <span className="font-mono">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No retry data</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
