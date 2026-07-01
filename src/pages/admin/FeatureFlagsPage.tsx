import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { getFeatureFlags, setFeatureFlag, resetFeatureFlags } from '../../lib/services/feature-flags';
import { getReleaseChannel, setReleaseChannel, resetReleaseChannel, CHANNEL_GATES, isAtLeast } from '../../lib/services/release-channels';
import type { FeatureFlags } from '../../lib/services/feature-flags';
import type { ReleaseChannel } from '../../lib/services/release-channels';
import { Flag, Radio, RotateCcw, CheckCircle, Server, Wifi, Shield, RefreshCw, Eye, Warehouse, Skull } from 'lucide-react';

const FLAG_ICONS: Record<keyof FeatureFlags, React.ElementType> = {
  indexDbMode: Server,
  dualWriteMode: RefreshCw,
  circuitBreaker: Shield,
  realtimeReplay: Wifi,
  sentryReplay: Eye,
  queueProcessing: Warehouse,
  chaosMode: Skull,
};

const FLAG_DESCRIPTIONS: Record<keyof FeatureFlags, string> = {
  indexDbMode: 'Use IndexedDB as primary storage backend',
  dualWriteMode: 'Dual-write mutations to both IndexedDB and localStorage',
  circuitBreaker: 'Circuit breaker for RPC calls to prevent cascade failures',
  realtimeReplay: 'Replay realtime events on WebSocket reconnect',
  sentryReplay: 'Record Sentry session replays for debugging',
  queueProcessing: 'Background processing of the mutation queue',
  chaosMode: 'Chaos testing mode — injects random failures',
};

const CHANNEL_COLORS: Record<ReleaseChannel, string> = {
  stable: 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary',
  beta: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  canary: 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
};

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlags>(getFeatureFlags());
  const [channel, setChannel] = useState<ReleaseChannel>(getReleaseChannel());
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    setFlags(getFeatureFlags());
    setChannel(getReleaseChannel());
  }, [resetKey]);

  function handleToggle(key: keyof FeatureFlags) {
    const newVal = !flags[key];
    setFeatureFlag(key, newVal);
    setFlags(prev => ({ ...prev, [key]: newVal }));
  }

  function handleChannelChange(newChannel: ReleaseChannel) {
    setReleaseChannel(newChannel);
    setChannel(newChannel);
  }

  function handleResetFlags() {
    resetFeatureFlags();
    setResetKey(k => k + 1);
  }

  function handleResetChannel() {
    resetReleaseChannel();
    setResetKey(k => k + 1);
  }

  const flagKeys = Object.keys(FLAG_DESCRIPTIONS) as (keyof FeatureFlags)[];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 border-t-4 border-t-teal-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-teal-600 dark:text-teal-400">Feature Flags</h1>
          <p className="text-sm text-muted-foreground">
            Toggle features and manage release channels
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleResetFlags}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Flags
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flag className="h-4 w-4" />
              Feature Toggles
            </CardTitle>
            <CardDescription>
              Enable or disable system features. Changes apply immediately via localStorage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {flagKeys.map((key) => {
              const Icon = FLAG_ICONS[key];
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <Label htmlFor={`flag-${key}`} className="font-medium text-sm capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                      <p className="text-xs text-muted-foreground">{FLAG_DESCRIPTIONS[key]}</p>
                    </div>
                  </div>
                  <Switch
                    id={`flag-${key}`}
                    checked={flags[key]}
                    onCheckedChange={() => handleToggle(key)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="h-4 w-4" />
                Release Channel
              </CardTitle>
              <CardDescription>
                Current channel: <Badge className={CHANNEL_COLORS[channel]} variant="outline">{channel}</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(['stable', 'beta', 'canary'] as ReleaseChannel[]).map((ch) => (
                <div key={ch} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${ch === 'stable' ? 'bg-green-500' : ch === 'beta' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="text-sm font-medium capitalize">{ch}</p>
                      <p className="text-xs text-muted-foreground">
                        {ch === 'stable' ? 'Production-ready features' : ch === 'beta' ? 'Preview features' : 'Experimental features'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={channel === ch ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleChannelChange(ch)}
                  >
                    {channel === ch ? 'Active' : 'Switch'}
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={handleResetChannel}>
                <RotateCcw className="h-3 w-3 mr-2" />
                Reset to Stable
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle className="h-4 w-4" />
                Channel Gates
              </CardTitle>
              <CardDescription>
                Features available at the <Badge className={CHANNEL_COLORS[channel]} variant="outline">{channel}</Badge> channel level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {CHANNEL_GATES.map((gate) => {
                  const available = isAtLeast(gate.minChannel);
                  return (
                    <div key={gate.feature} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{gate.description}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{gate.minChannel}</Badge>
                        {available ? (
                          <CheckCircle className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
