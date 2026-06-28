import { useState } from "react";
import { RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Link, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { showSuccess, showError } from "./ui/toast";
import { useRoomMappings, useCreateRoomMapping, useDeleteRoomMapping, useSyncLogs, useSyncQueue, useExternalBookings, useTriggerRetryQueue, useReconciliationIssues, useResolveReconciliationIssue, useTriggerReconciliation } from "../lib/hooks/booking-sync.hooks";
import { useRooms } from "../lib/hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import type { RoomMapping } from "../lib/services/booking-sync.types";

export function SyncAdminPanel() {
  const { data: mappings, isLoading: mappingsLoading } = useRoomMappings();
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const { data: queue, isLoading: queueLoading } = useSyncQueue();
  const { data: extBookings } = useExternalBookings();
  const { data: rooms } = useRooms();
  const createMapping = useCreateRoomMapping();
  const deleteMapping = useDeleteRoomMapping();
  const retryQueue = useTriggerRetryQueue();
  const { data: recIssues, isLoading: recLoading } = useReconciliationIssues();
  const resolveIssue = useResolveReconciliationIssue();
  const triggerRec = useTriggerReconciliation();

  const [tab, setTab] = useState<"logs" | "mappings" | "queue" | "external" | "reconciliation">("logs");
  const [newMapping, setNewMapping] = useState({ pos_room_id: "", website_room_id: "", website_room_name: "" });
  const [deleteTarget, setDeleteTarget] = useState<RoomMapping | null>(null);
  const [showNewMapping, setShowNewMapping] = useState(false);

  const failedCount = syncLogs?.filter(l => l.status === "failed").length ?? 0;
  const queuedCount = queue?.filter(q => q.status === "queued").length ?? 0;

  const statusBadge = (status: string) => {
    switch (status) {
      case "success": return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
      case "failed": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "skipped": return <Badge variant="warning"><AlertTriangle className="h-3 w-3 mr-1" />Skipped</Badge>;
      default: return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const handleCreateMapping = async () => {
    if (!newMapping.pos_room_id || !newMapping.website_room_id) return;
    try {
      await createMapping.mutateAsync(newMapping);
      showSuccess("Room mapping created");
      setNewMapping({ pos_room_id: "", website_room_id: "", website_room_name: "" });
      setShowNewMapping(false);
    } catch (err) {
      showError((err as Error)?.message || "Failed to create mapping");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync Management</h1>
          <p className="text-muted-foreground">Website-POS booking synchronization</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => retryQueue.mutate()} disabled={retryQueue.isPending || queuedCount === 0} className="min-h-[44px]">
            <RefreshCw className={`h-4 w-4 mr-1 ${retryQueue.isPending ? "animate-spin" : ""}`} />
            Retry Queue ({queuedCount})
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Syncs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{syncLogs?.length ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-destructive">Failed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{failedCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-600">Queued Retries</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{queuedCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Room Mappings</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{mappings?.length ?? 0}</div></CardContent></Card>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["logs", "mappings", "queue", "external", "reconciliation"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "logs" ? "Sync Logs" : t === "mappings" ? "Room Mappings" : t === "queue" ? "Retry Queue" : t === "external" ? "External Bookings" : "Reconciliation"}
          </button>
        ))}
      </div>

      {tab === "logs" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Direction</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Event</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">External ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Error</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : syncLogs?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No sync logs yet</td></tr>
                ) : syncLogs?.map((log) => (
                  <tr key={log.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge variant={log.direction === "incoming" ? "secondary" : "outline"}>{log.direction === "incoming" ? "IN" : "OUT"}</Badge></td>
                    <td className="px-4 py-3 font-mono text-xs">{log.event_type}</td>
                    <td className="px-4 py-3 text-xs">{log.external_id || "-"}</td>
                    <td className="px-4 py-3">{statusBadge(log.status)}</td>
                    <td className="px-4 py-3 text-xs text-destructive max-w-[200px] truncate">{log.error_message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "mappings" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowNewMapping(!showNewMapping)} size="sm" className="min-h-[44px]">
              <Link className="h-4 w-4 mr-1" /> Add Mapping
            </Button>
          </div>

          {showNewMapping && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">POS Room</label>
                    <select value={newMapping.pos_room_id} onChange={(e) => setNewMapping(p => ({ ...p, pos_room_id: e.target.value }))} className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none">
                      <option value="">Select room</option>
                      {rooms?.map(r => <option key={r.id} value={r.id}>#{r.room_number} - {r.room_types?.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Website Room ID</label>
                    <input type="text" value={newMapping.website_room_id} onChange={(e) => setNewMapping(p => ({ ...p, website_room_id: e.target.value }))} placeholder="WEB-ROOM-001" className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Website Room Name</label>
                    <input type="text" value={newMapping.website_room_name} onChange={(e) => setNewMapping(p => ({ ...p, website_room_name: e.target.value }))} placeholder="Deluxe Room 101" className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNewMapping(false)} size="sm">Cancel</Button>
                  <Button onClick={handleCreateMapping} disabled={!newMapping.pos_room_id || !newMapping.website_room_id || createMapping.isPending} size="sm">Create Mapping</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">POS Room</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Website Room ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Website Name</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappingsLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : mappings?.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No room mappings configured</td></tr>
                ) : mappings?.map((m) => (
                  <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">#{m.website_room_name || m.pos_room_id?.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{m.website_room_id}</td>
                    <td className="px-4 py-3">{m.website_room_name || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteTarget(m)} className="text-destructive hover:text-destructive/80 p-1"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "queue" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Event</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Direction</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Retries</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Error</th>
              </tr>
            </thead>
            <tbody>
              {queueLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : queue?.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Queue is empty</td></tr>
              ) : queue?.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 text-xs">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.event_type}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{item.direction}</Badge></td>
                  <td className="px-4 py-3">{item.retry_count}/{item.max_retries}</td>
                  <td className="px-4 py-3">{statusBadge(item.status)}</td>
                  <td className="px-4 py-3 text-xs text-destructive max-w-[200px] truncate">{item.last_error || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "external" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">External ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">POS Booking</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Sync</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {extBookings?.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No external bookings linked</td></tr>
              ) : extBookings?.map((eb) => (
                <tr key={eb.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{eb.external_booking_id}</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{eb.source}</Badge></td>
                  <td className="px-4 py-3 text-xs">{eb.pos_booking_id?.slice(0, 8) || "-"}</td>
                  <td className="px-4 py-3 text-xs">{eb.last_sync_at ? new Date(eb.last_sync_at).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3">{statusBadge(eb.last_sync_status || "pending")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reconciliation" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Detected discrepancies between POS and Website booking data.</p>
            <Button onClick={() => triggerRec.mutate({})} disabled={triggerRec.isPending} size="sm" className="min-h-[44px]">
              <ShieldAlert className={`h-4 w-4 mr-1 ${triggerRec.isPending ? "animate-spin" : ""}`} />
              Run Reconciliation
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Detected</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issue Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entity</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : recIssues?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No reconciliation issues found</td></tr>
                ) : recIssues?.map((issue) => (
                  <tr key={issue.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(issue.detected_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">{issue.issue_type}</td>
                    <td className="px-4 py-3">{(
                      issue.severity === "critical" ? <Badge variant="destructive">Critical</Badge> :
                      issue.severity === "high" ? <Badge variant="destructive">High</Badge> :
                      issue.severity === "medium" ? <Badge variant="warning">Medium</Badge> :
                      <Badge variant="outline">Low</Badge>
                    )}</td>
                    <td className="px-4 py-3 text-xs">{issue.entity_id?.slice(0, 8) || "-"}</td>
                    <td className="px-4 py-3 text-xs max-w-[200px] truncate">{issue.field_name ? `${issue.field_name}: website=${issue.website_value} pos=${issue.pos_value}` : issue.issue_type}</td>
                    <td className="px-4 py-3 text-right">
                      {issue.resolved_at ? (
                        <Badge variant="success">Resolved</Badge>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => resolveIssue.mutate({ id: issue.id, resolution: "acknowledged" })} disabled={resolveIssue.isPending} className="min-h-[44px]">
                          <CheckCircle className="h-3 w-3 mr-1" /> Acknowledge
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete Room Mapping"
        description={`Remove mapping for website room ${deleteTarget?.website_room_id}?`}
        consequence="The room mapping will be permanently deleted. External bookings for this room will no longer auto-link."
        entity={`Room Mapping: ${deleteTarget?.website_room_id ?? ""}`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMapping.mutate(deleteTarget.id, {
            onSuccess: () => { showSuccess("Mapping deleted"); setDeleteTarget(null); },
            onError: (err) => showError((err as Error)?.message || "Delete failed"),
          });
        }}
        isPending={deleteMapping.isPending}
      />
    </div>
  );
}
