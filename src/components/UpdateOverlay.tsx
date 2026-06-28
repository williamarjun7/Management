import { Capacitor } from '@capacitor/core';
import { useUpdate } from '../lib/core/update-context';
import { getCurrentAppVersion } from '../lib/services/app-update';
import { ForceUpdateScreen } from './ForceUpdateScreen';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Download, Sparkles } from 'lucide-react';

export function UpdateOverlay() {
  const { updateAvailable, forceUpdateRequired, updateInfo, dismissed, startUpdate, dismissUpdate } = useUpdate();
  const currentVersion = getCurrentAppVersion();

  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  if (forceUpdateRequired) {
    return <ForceUpdateScreen />;
  }

  if (!updateAvailable || dismissed || !updateInfo) {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={() => dismissUpdate()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Version {updateInfo.latestVersion} Available</DialogTitle>
              <DialogDescription className="mt-1">
                A new version of Highlands Cafe POS is ready
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What's New</p>
          {updateInfo.releaseNotes.length > 0 ? (
            <ul className="space-y-1">
              {updateInfo.releaseNotes.map((note, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Bug fixes and improvements</p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-muted-foreground">Current version</span>
          <span className="font-medium">{currentVersion}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={dismissUpdate} className="min-h-[44px]">
            Later
          </Button>
          <Button onClick={startUpdate} className="min-h-[44px] gap-2">
            <Download className="h-4 w-4" />
            Update Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
