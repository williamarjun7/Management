import { insforge } from '../core/insforge';
import type { AppVersion, AppVersionCheckResult } from '../../types';

export function getCurrentAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
}

export function getCurrentVersionCode(): number {
  return typeof __APP_VERSION_CODE__ !== 'undefined' ? parseInt(__APP_VERSION_CODE__, 10) || 1 : 1;
}

export function parseSemver(version: string): number[] {
  return version.split('.').map(Number);
}

export function isVersionGte(current: string, minimum: string): boolean {
  const cur = parseSemver(current);
  const min = parseSemver(minimum);
  for (let i = 0; i < Math.max(cur.length, min.length); i++) {
    const a = cur[i] ?? 0;
    const b = min[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export async function checkForUpdate(): Promise<AppVersionCheckResult | null> {
  try {
    const { data, error } = await insforge.database.rpc('get_latest_app_version');
    if (error) throw error;
    return data as unknown as AppVersionCheckResult;
  } catch {
    return null;
  }
}

export function isUpdateAvailable(current: string, latest: string): boolean {
  if (current === latest) return false;
  const cur = parseSemver(current);
  const lat = parseSemver(latest);
  for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
    const a = cur[i] ?? 0;
    const b = lat[i] ?? 0;
    if (a > b) return false;
    if (a < b) return true;
  }
  return false;
}

export function isForceUpdateRequired(currentVersionCode: number, minVersionCode: number): boolean {
  return currentVersionCode < minVersionCode;
}

export async function createAppVersion(data: {
  version: string;
  version_code: number;
  min_version: string;
  min_version_code: number;
  force_update: boolean;
  apk_url: string;
  release_notes: string[];
}): Promise<void> {
  const { error: clearError } = await insforge.database
    .from('app_versions')
    .update({ is_current: false })
    .eq('is_current', true);
  if (clearError) throw clearError;

  const { error } = await insforge.database
    .from('app_versions')
    .insert([{ ...data, is_current: true }]);
  if (error) throw error;
}

export async function getAllAppVersions(): Promise<AppVersion[]> {
  const { data, error } = await insforge.database
    .from('app_versions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AppVersion[];
}

export async function updateAppVersion(id: string, updates: Partial<{
  version: string;
  version_code: number;
  min_version: string;
  min_version_code: number;
  force_update: boolean;
  apk_url: string;
  release_notes: string[];
  is_current: boolean;
}>): Promise<void> {
  if (updates.is_current) {
    const { error: clearError } = await insforge.database
      .from('app_versions')
      .update({ is_current: false })
      .eq('is_current', true);
    if (clearError) throw clearError;
  }

  const { error } = await insforge.database
    .from('app_versions')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function downloadApk(
  apkUrl: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', apkUrl, true);
    xhr.responseType = 'blob';

    xhr.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Blob);
      } else {
        reject(new Error(`Download failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Download failed: network error'));
    xhr.ontimeout = () => reject(new Error('Download timed out'));
    xhr.timeout = 300000;

    xhr.send();
  });
}

export function triggerSystemDownload(apkUrl: string): void {
  window.open(apkUrl, '_blank');
}
