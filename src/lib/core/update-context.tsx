import { Capacitor } from '@capacitor/core';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  getCurrentAppVersion,
  getCurrentVersionCode,
  checkForUpdate,
  isUpdateAvailable,
  isForceUpdateRequired,
  triggerSystemDownload,
} from '../services/app-update';
import type { AppVersionCheckResult } from '../../types';

interface UpdateContextValue {
  checking: boolean;
  updateAvailable: boolean;
  forceUpdateRequired: boolean;
  updateInfo: AppVersionCheckResult | null;
  downloadProgress: number;
  downloading: boolean;
  dismissed: boolean;
  startUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  retryCheck: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const currentVersion = getCurrentAppVersion();
  const currentVersionCode = getCurrentVersionCode();

  const [checking, setChecking] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<AppVersionCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const updateAvailable = updateInfo
    ? isUpdateAvailable(currentVersion, updateInfo.latestVersion)
    : false;

  const forceUpdateRequired = updateInfo
    ? isForceUpdateRequired(currentVersionCode, updateInfo.minimumSupportedVersionCode)
    : false;

  const performCheck = useCallback(async () => {
    setChecking(true);
    const result = await checkForUpdate();
    setUpdateInfo(result);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      performCheck();
    } else {
      setChecking(false);
    }
  }, [performCheck]);

  const startUpdate = useCallback(async () => {
    if (!updateInfo) return;
    triggerSystemDownload(updateInfo.apkUrl);
  }, [updateInfo]);

  const dismissUpdate = useCallback(() => {
    setDismissed(true);
  }, []);

  const retryCheck = useCallback(async () => {
    setDismissed(false);
    await performCheck();
  }, [performCheck]);

  return (
    <UpdateContext.Provider
      value={{
        checking,
        updateAvailable,
        forceUpdateRequired,
        updateInfo,
        downloadProgress: 0,
        downloading: false,
        dismissed,
        startUpdate,
        dismissUpdate,
        retryCheck,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdate must be used within an UpdateProvider');
  return ctx;
}
