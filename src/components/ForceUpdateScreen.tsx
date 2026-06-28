import { useUpdate } from '../lib/core/update-context';
import { getCurrentAppVersion } from '../lib/services/app-update';
import { Download, AlertTriangle, RefreshCw } from 'lucide-react';

export function ForceUpdateScreen() {
  const { checking, updateInfo, startUpdate, retryCheck } = useUpdate();
  const currentVersion = getCurrentAppVersion();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold">Update Required</h1>
          <p className="text-sm text-muted-foreground">
            Your version of Highlands Cafe POS is no longer supported.
            Please update to continue.
          </p>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Version</span>
            <span className="font-medium">{currentVersion}</span>
          </div>
          {updateInfo && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Latest Version</span>
              <span className="font-medium">{updateInfo.latestVersion}</span>
            </div>
          )}
        </div>

        {checking ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Checking for updates...
          </div>
        ) : updateInfo ? (
          <button
            onClick={startUpdate}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="h-5 w-5" />
            Update Now
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Unable to check for updates. Check your connection.</p>
            <button
              onClick={retryCheck}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-input px-6 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
