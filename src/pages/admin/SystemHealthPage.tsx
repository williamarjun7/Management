import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { getQueueHealth, clearCompletedMutations } from '../../lib/services/mutation-queue';
import { getCircuitState, resetCircuit } from '../../lib/services/circuit-breaker';
import { getLeaderState } from '../../lib/services/queue-leader';
import { getRealtimeDiagnostics } from '../../lib/services/realtime';
import { verifyParity, checkQueueIntegrity } from '../../lib/services/queue-db';
import { getTelemetry, getTelemetryMetrics, getStorageTelemetryCount } from '../../lib/services/telemetry';
import { RefreshCw, Activity, Shield, Database, Wifi, Radio, Zap, CheckCircle, XCircle, BarChart3, Globe, Clock, Fingerprint, LineChart, Network, Server } from 'lucide-react';
import type { QueueHealthMetrics } from '../../lib/services/mutation-queue';
import type { TelemetryMetrics } from '../../lib/services/telemetry';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
type LeaderState = 'leading' | 'following' | 'contesting';

interface HealthData {
  queue: QueueHealthMetrics | null;
  circuit: { state: CircuitState; failuresInWindow: number; probeInFlight: boolean };
  leadership: LeaderState;
  realtime: ReturnType<typeof getRealtimeDiagnostics>;
  parity: { inSync: boolean; indexDbCount: number; localStorageCount: number; mismatches: string[] } | null;
  integrity: { valid: boolean; corruptionCount: number; totalItems: number; details: string[] } | null;
  telemetry: TelemetryMetrics | null;
  storageTelemetryCount: number;
  recentReconnects: number;
  recentReplayBatches: number;
  recentAuthFailures: number;
  recentAuthLogins: number;
  recentSlowRpcs: number;
  recentCircuitEvents: number;
}

function circuitColor(state: CircuitState): string {
  switch (state) {
    case 'CLOSED': return 'bg-primary text-primary-foreground';
    case 'HALF_OPEN': return 'bg-secondary text-secondary-foreground';
    case 'OPEN': return 'bg-destructive text-destructive-foreground';
  }
}

function leaderColor(state: LeaderState): string {
  switch (state) {
    case 'leading': return 'bg-primary text-primary-foreground';
    case 'following': return 'bg-secondary text-secondary-foreground';
    case 'contesting': return 'bg-accent text-accent-foreground';
  }
}

function statusIcon(ok: boolean) {
  return ok ? <CheckCircle className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />;
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const REFRESH_INTERVAL = 10000;

function getInitialHealthData(): HealthData {
  const fiveMinAgo = Date.now() - 300000;
  return {
    queue: null,
    circuit: getCircuitState(),
    leadership: getLeaderState(),
    realtime: getRealtimeDiagnostics(),
    parity: null,
    integrity: null,
    telemetry: null,
    storageTelemetryCount: 0,
    recentReconnects: getTelemetry('websocket_reconnect', fiveMinAgo).length,
    recentReplayBatches: getTelemetry('replay_batch', fiveMinAgo).length,
    recentAuthFailures: getTelemetry('auth_refresh_failed', fiveMinAgo).length,
    recentAuthLogins: getTelemetry('auth_login', fiveMinAgo).length,
    recentSlowRpcs: getTelemetry('rpc_latency', fiveMinAgo).filter((e) => (e.payload.duration_ms as number) > 5000).length,
    recentCircuitEvents: getTelemetry('circuit_state_change', fiveMinAgo).length,
  };
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData>(getInitialHealthData);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    const fiveMinAgo = Date.now() - 300000;

    getQueueHealth()
      .then((queue) => {
        setData({
          queue,
          circuit: getCircuitState(),
          leadership: getLeaderState(),
          realtime: getRealtimeDiagnostics(),
          parity: null,
          integrity: null,
          telemetry: null,
          storageTelemetryCount: 0,
          recentReconnects: getTelemetry('websocket_reconnect', fiveMinAgo).length,
          recentReplayBatches: getTelemetry('replay_batch', fiveMinAgo).length,
          recentAuthFailures: getTelemetry('auth_refresh_failed', fiveMinAgo).length,
          recentAuthLogins: getTelemetry('auth_login', fiveMinAgo).length,
          recentSlowRpcs: getTelemetry('rpc_latency', fiveMinAgo).filter((e) => (e.payload.duration_ms as number) > 5000).length,
          recentCircuitEvents: getTelemetry('circuit_state_change', fiveMinAgo).length,
        });
      })
      .catch((err) => {
        setError((err as Error)?.message || 'Failed to fetch health data');
      });

    Promise.all([
      verifyParity().catch(() => null),
      checkQueueIntegrity().catch(() => null),
      Promise.resolve(getTelemetryMetrics()),
      getStorageTelemetryCount().catch(() => 0),
    ]).then(([parity, integrity, telemetry, storageTelemetryCount]) => {
      setData((prev) => ({
        ...prev,
        parity: parity as HealthData['parity'],
        integrity: integrity as HealthData['integrity'],
        telemetry: telemetry as TelemetryMetrics,
        storageTelemetryCount: storageTelemetryCount as number,
      }));
    });
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const handleResetCircuit = () => {
    resetCircuit();
    refresh();
  };

  const handleClearCompleted = async () => {
    await clearCompletedMutations();
    refresh();
  };

  const tm = data.telemetry;
  const { recentReconnects, recentReplayBatches, recentAuthFailures, recentAuthLogins, recentSlowRpcs, recentCircuitEvents } = data;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Health Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time health metrics for the offline-sync, queue, and realtime subsystems.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} className="min-h-[44px]">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 md:grid-cols-2">
        {/* Queue Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-primary" />
              Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.queue ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Total</p>
                    <p className="font-semibold text-lg">{data.queue.queueSize}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Pending</p>
                    <p className="font-semibold text-lg">{data.queue.pendingCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Processing</p>
                    <p className="font-semibold text-lg">{data.queue.processingCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Completed</p>
                    <p className="font-semibold text-lg text-primary">{data.queue.completedCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Failed</p>
                    <p className="font-semibold text-lg text-destructive">{data.queue.failedCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Dead Letters</p>
                    <p className="font-semibold text-lg text-destructive">{data.queue.deadLetterCount}</p>
                  </div>
                </div>
                <div className="border-t pt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Oldest item</span>
                    <span>{formatMs(data.queue.oldestItemAgeMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg processing</span>
                    <span>{formatMs(data.queue.avgProcessingTimeMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Throughput (1m)</span>
                    <span>{data.queue.throughputPerMinute} drains</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last drain</span>
                    <span className="font-mono text-xs">{data.queue.lastDrainTimestamp ? new Date(data.queue.lastDrainTimestamp).toLocaleTimeString() : '—'}</span>
                  </div>
                  {Object.keys(data.queue.retryDistribution).length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Retry distribution</span>
                      <span className="font-mono text-xs">
                        {Object.entries(data.queue.retryDistribution)
                          .map(([k, v]) => `r${k}:${v}`).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="border-t pt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleClearCompleted} className="text-xs">
                    Clear Completed
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Queue not available</p>
            )}
          </CardContent>
        </Card>

        {/* Circuit Breaker Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" />
              Circuit Breaker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge className={circuitColor(data.circuit.state)}>
                {data.circuit.state}
              </Badge>
              {data.circuit.probeInFlight && (
                <Badge variant="outline" className="text-amber-500 border-amber-500">
                  Probe In Flight
                </Badge>
              )}
              {recentCircuitEvents > 0 && (
                <Badge variant="outline" className="text-amber-500 border-amber-500">
                  {recentCircuitEvents} changes (5m)
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Failures in window (30s)</p>
                <p className="font-semibold">{data.circuit.failuresInWindow} / 10</p>
              </div>
            </div>
            {data.circuit.state !== 'CLOSED' && (
              <div className="border-t pt-3">
                <Button variant="outline" size="sm" onClick={handleResetCircuit} className="text-xs">
                  <Zap className="mr-1 h-3 w-3" /> Reset Circuit
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leadership Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-5 w-5 text-primary" />
              Multi-Tab Leadership
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge className={leaderColor(data.leadership)}>
                {data.leadership}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {data.leadership === 'leading'
                ? 'This tab is the active queue processor.'
                : data.leadership === 'following'
                  ? 'Another tab is leading. Monitoring for leader failure.'
                  : 'Contesting for leadership...'}
            </div>
          </CardContent>
        </Card>

        {/* Realtime Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="h-5 w-5 text-primary" />
              Realtime / Replay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Active channels</p>
                <p className="font-semibold text-lg">{data.realtime.channelCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Replay chunk size</p>
                <p className="font-semibold">{data.realtime.replayChunkSize}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Cleanup interval</p>
                <p className="font-semibold">{(data.realtime.cleanupIntervalMs / 1000).toFixed(0)}s</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Stale threshold</p>
                <p className="font-semibold">{(data.realtime.staleThresholdMs / 60000).toFixed(0)}m</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Replay batches (5m)</span>
                <span className="font-semibold">{recentReplayBatches}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reconnects (5m)</span>
                <span className={`font-semibold ${recentReconnects > 5 ? 'text-destructive' : ''}`}>{recentReconnects}</span>
              </div>
            </div>
            {data.realtime.channels.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">Active channels:</p>
                <div className="flex flex-wrap gap-1">
                  {data.realtime.channels.map((ch) => (
                    <Badge key={ch} variant="secondary" className="text-xs">
                      {ch}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-primary" />
              Storage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.parity ? (
              <>
                <div className="flex items-center gap-2">
                  {statusIcon(data.parity.inSync)}
                  <span className="text-sm font-medium">
                    {data.parity.inSync ? 'IndexedDB ↔ localStorage in sync' : 'Desync detected'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">IndexedDB items</p>
                    <p className="font-semibold">{data.parity.indexDbCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">localStorage items</p>
                    <p className="font-semibold">{data.parity.localStorageCount}</p>
                  </div>
                </div>
                {data.parity.mismatches.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs text-muted-foreground mb-1">Mismatches:</p>
                    <ul className="text-xs text-destructive space-y-0.5 list-disc list-inside">
                      {data.parity.mismatches.slice(0, 5).map((m, i) => (
                        <li key={i} className="truncate">{m}</li>
                      ))}
                      {data.parity.mismatches.length > 5 && (
                        <li className="text-muted-foreground">...and {data.parity.mismatches.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Storage parity data not available</p>
            )}
            {data.integrity && (
              <div className="border-t pt-3">
                <div className="flex items-center gap-2">
                  {statusIcon(data.integrity.valid)}
                  <span className="text-sm font-medium">
                    {data.integrity.valid ? 'Queue integrity: OK' : `Corruption: ${data.integrity.corruptionCount} items`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{data.integrity.totalItems} items checked</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Browser / Environment Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-5 w-5 text-primary" />
              Browser / Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Online</span>
              {statusIcon(navigator.onLine)}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">User Agent</span>
              <span className="font-mono text-xs truncate max-w-[200px]">{navigator.userAgent.slice(0, 60)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auto-refresh</span>
              <span>{(REFRESH_INTERVAL / 1000).toFixed(0)}s</span>
            </div>
          </CardContent>
        </Card>

        {/* Telemetry Health Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" />
              Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tm ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Total events</p>
                    <p className="font-semibold text-lg">{formatNumber(tm.total)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Last hour</p>
                    <p className="font-semibold text-lg">{tm.lastHour}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Today</p>
                    <p className="font-semibold text-lg">{tm.today}</p>
                  </div>
                </div>
                <div className="border-t pt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IDB stored</span>
                    <span>{formatNumber(data.storageTelemetryCount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg RPC latency</span>
                    <span>{formatMs(tm.avgRpcLatencyMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RPC calls (today)</span>
                    <span>{tm.rpcCallCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queue usage (today)</span>
                    <span>{tm.queueUsage}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading telemetry...</p>
            )}
          </CardContent>
        </Card>

        {/* Websocket Health Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5 text-primary" />
              Websocket
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Reconnects (5m)</p>
                <p className={`font-semibold text-lg ${recentReconnects > 5 ? 'text-destructive' : ''}`}>{recentReconnects}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total (today)</p>
                <p className="font-semibold text-lg">{tm?.reconnectCount ?? '—'}</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Websocket events (today)</span>
                <span>{tm?.websocketEventCount ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Online status</span>
                <span className={navigator.onLine ? 'text-primary font-medium' : 'text-destructive font-medium'}>
                  {navigator.onLine ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RPC Latency Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-primary" />
              RPC Latency
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Average</p>
                <p className="font-semibold text-lg">{formatMs(tm?.avgRpcLatencyMs ?? null)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Slow calls (5m) &gt;5s</p>
                <p className={`font-semibold text-lg ${recentSlowRpcs > 10 ? 'text-destructive' : ''}`}>{recentSlowRpcs}</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total calls (today)</span>
                <span>{tm?.rpcCallCount ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Circuit breaker</span>
                <Badge className={circuitColor(data.circuit.state)}>
                  {data.circuit.state}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auth Lifecycle Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="h-5 w-5 text-primary" />
              Auth Lifecycle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Logins (5m)</p>
                <p className="font-semibold text-lg">{recentAuthLogins}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Refresh failures (5m)</p>
                <p className={`font-semibold text-lg ${recentAuthFailures > 3 ? 'text-destructive' : ''}`}>{recentAuthFailures}</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auth events (today)</span>
                <span>{tm?.authEventCount ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Circuit events (5m)</span>
                <span>{recentCircuitEvents}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Event Throughput Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChart className="h-5 w-5 text-primary" />
              Event Throughput
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tm ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Realtime events (today)</p>
                    <p className="font-semibold text-lg">{formatNumber(tm.realtimeEventCount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Page views (today)</p>
                    <p className="font-semibold text-lg">{tm.pageViewCount}</p>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Event distribution:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(tm.counts)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([type, count]) => (
                        <Badge key={type} variant="secondary" className="text-xs">
                          {type}: {count}
                        </Badge>
                      ))}
                  </div>
                  {Object.keys(tm.counts).length > 8 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ...and {Object.keys(tm.counts).length - 8} more types
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading throughput...</p>
            )}
          </CardContent>
        </Card>

        {/* Mutation Replay Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-5 w-5 text-primary" />
              Mutation Replay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Replay batches (5m)</p>
                <p className="font-semibold text-lg">{recentReplayBatches}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Active channels</p>
                <p className="font-semibold text-lg">{data.realtime.channelCount}</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Idempotent replays (today)</span>
                <span>{tm?.idempotentReplayCount ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed mutations (today)</span>
                <span className={tm && tm.failedMutationCount > 0 ? 'text-destructive' : ''}>{tm?.failedMutationCount ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dead letters</span>
                <span className={data.queue && data.queue.deadLetterCount > 0 ? 'text-destructive font-medium' : ''}>
                  {data.queue?.deadLetterCount ?? '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
