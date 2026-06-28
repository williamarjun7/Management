import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllAppVersions, createAppVersion, updateAppVersion, getCurrentAppVersion } from '../../lib/services/app-update';
import { showSuccess, showError } from '../../components/ui/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Plus, History, Smartphone, Download, ArrowLeft, Loader2, Check, RefreshCw } from 'lucide-react';
import type { AppVersion } from '../../types';

export default function AppUpdatesPage() {
  const qc = useQueryClient();
  const { data: versions, isLoading } = useQuery<AppVersion[]>({
    queryKey: ['app-versions'],
    queryFn: () => getAllAppVersions(),
  });
  const currentVersion = getCurrentAppVersion();
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [rollbackConfirm, setRollbackConfirm] = useState<AppVersion | null>(null);
  const [form, setForm] = useState({
    version: '',
    version_code: 1,
    min_version: '1.0.0',
    min_version_code: 1,
    force_update: false,
    apk_url: '',
    release_notes_text: '',
  });

  const currentRelease = versions?.find(v => v.is_current);
  const previousReleases = versions?.filter(v => !v.is_current) ?? [];

  const handleCreate = async () => {
    if (!form.version || !form.apk_url) return;
    try {
      await createAppVersion({
        version: form.version,
        version_code: form.version_code,
        min_version: form.min_version,
        min_version_code: form.min_version_code,
        force_update: form.force_update,
        apk_url: form.apk_url,
        release_notes: form.release_notes_text.split('\n').filter(Boolean),
      });
      setShowCreate(false);
      setForm({ version: '', version_code: 1, min_version: '1.0.0', min_version_code: 1, force_update: false, apk_url: '', release_notes_text: '' });
      qc.invalidateQueries({ queryKey: ['app-versions'] });
      showSuccess('New version published');
    } catch { showError('Failed to publish version'); }
  };

  const handleRollback = async () => {
    if (!rollbackConfirm) return;
    try {
      await updateAppVersion(rollbackConfirm.id, { is_current: true });
      setRollbackConfirm(null);
      qc.invalidateQueries({ queryKey: ['app-versions'] });
      showSuccess(`Rolled back to v${rollbackConfirm.version}`);
    } catch { showError('Rollback failed'); }
  };

  const handleToggleForce = async (version: AppVersion) => {
    try {
      await updateAppVersion(version.id, { force_update: !version.force_update });
      qc.invalidateQueries({ queryKey: ['app-versions'] });
      showSuccess(version.force_update ? 'Update marked optional' : 'Update marked mandatory');
    } catch { showError('Failed to update'); }
  };

  if (showHistory) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHistory(false)} className="p-2 rounded-lg hover:bg-accent">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Version History</h1>
              <p className="text-sm text-muted-foreground">All previous releases</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {previousReleases.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
              <History className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-muted-foreground">No previous releases</p>
            </div>
          )}
          {previousReleases.map((v) => (
            <div key={v.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">v{v.version}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${v.force_update ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-muted text-muted-foreground'}`}>
                        {v.force_update ? 'Mandatory' : 'Optional'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Published {new Date(v.published_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRollbackConfirm(v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Rollback
                </button>
              </div>
              {v.release_notes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes:</p>
                  <ul className="space-y-0.5">
                    {v.release_notes.map((note, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary">•</span> {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {rollbackConfirm && (
          <ConfirmDialog
            open={!!rollbackConfirm}
            onOpenChange={() => setRollbackConfirm(null)}
            onConfirm={handleRollback}
            title="Rollback Version?"
            description={`Roll back to v${rollbackConfirm.version}? The current version will be marked as not current but will remain in the database.`}
            consequence={`App will serve v${rollbackConfirm.version} to clients on next update check.`}
            entity={`v${rollbackConfirm.version}`}
            confirmLabel="Rollback"
            confirmVariant="secondary"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">App Updates</h1>
          <p className="text-sm text-muted-foreground">Manage OTA application updates</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <History className="h-4 w-4" /> History
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Publish
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {currentRelease && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="bg-primary/5 px-4 py-2 border-b border-border flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary">Current Release</span>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">v{currentRelease.version}</h2>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${currentRelease.force_update ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                      {currentRelease.force_update ? 'Mandatory' : 'Optional'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Installed: v{currentVersion} • Published {new Date(currentRelease.published_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleToggleForce(currentRelease)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent ${currentRelease.force_update ? 'text-amber-600 border-amber-200' : ''}`}
              >
                {currentRelease.force_update ? 'Mark Optional' : 'Mark Mandatory'}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Version Code</p>
                <p className="text-sm font-semibold">{currentRelease.version_code}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Min Version</p>
                <p className="text-sm font-semibold">v{currentRelease.min_version} (code {currentRelease.min_version_code})</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">APK URL</p>
                <p className="text-sm font-semibold truncate max-w-[200px]" title={currentRelease.apk_url}>
                  {currentRelease.apk_url.replace('https://', '')}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Download</p>
                <a href={currentRelease.apk_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  <Download className="h-3.5 w-3.5" /> APK
                </a>
              </div>
            </div>

            {currentRelease.release_notes.length > 0 && (
              <div className="mt-4 rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes:</p>
                <ul className="space-y-0.5">
                  {currentRelease.release_notes.map((note, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {!currentRelease && !isLoading && (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
          <Smartphone className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-muted-foreground">No version published yet</p>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Publish New Version</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Version *</label>
                  <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. 1.5.0" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Version Code *</label>
                  <input type="number" value={form.version_code} onChange={e => setForm(f => ({ ...f, version_code: parseInt(e.target.value) || 1 }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Min Supported Version</label>
                  <input value={form.min_version} onChange={e => setForm(f => ({ ...f, min_version: e.target.value }))} placeholder="e.g. 1.0.0" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Min Version Code</label>
                  <input type="number" value={form.min_version_code} onChange={e => setForm(f => ({ ...f, min_version_code: parseInt(e.target.value) || 1 }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">APK URL *</label>
                <input value={form.apk_url} onChange={e => setForm(f => ({ ...f, apk_url: e.target.value }))} placeholder="https://pos.highlandscafemotelinn.com/downloads/highlands-pos-1.5.0.apk" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.force_update} onChange={e => setForm(f => ({ ...f, force_update: e.target.checked }))} className="rounded border-input" />
                  <span className="text-sm font-medium">Force Update (mandatory)</span>
                </label>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Release Notes (one per line)</label>
                <textarea
                  value={form.release_notes_text}
                  onChange={e => setForm(f => ({ ...f, release_notes_text: e.target.value }))}
                  placeholder="Improved order processing&#10;Fixed table occupancy logic&#10;Performance improvements"
                  rows={5}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={handleCreate} disabled={!form.version || !form.apk_url} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Publish
                </button>
                <button onClick={() => setShowCreate(false)} className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
