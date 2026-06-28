import { useState, useCallback, useMemo } from "react";
import { useAuditLogs } from "../../lib/hooks";
import { Card, CardContent } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Download, ChevronDown, ChevronRight, Calendar } from "lucide-react";
import type { SystemEvent } from "../../types";

const EVENT_COLORS: Record<string, string> = {
  ORDER_CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ORDER_STATUS_CHANGED: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  PAYMENT_RECEIVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  PAYMENT_REVERSED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ROOM_CHECKED_IN: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  ROOM_CHECKED_OUT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  STOCK_LOW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  STOCK_MOVEMENT: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  BOOKING_CREATED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  TABLE_SESSION_STARTED: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  TABLE_SESSION_CLOSED: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  WORKFLOW_STEP_CHANGED: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  ORDER_CREATED: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
};

const EVENT_TYPES = [
  { value: "all", label: "All Events" },
  { value: "ORDER_CONFIRMED", label: "Order Confirmed" },
  { value: "ORDER_STATUS_CHANGED", label: "Order Status Changed" },
  { value: "ORDER_CREATED", label: "Order Created" },
  { value: "PAYMENT_RECEIVED", label: "Payment Received" },
  { value: "PAYMENT_REVERSED", label: "Payment Reversed" },
  { value: "ROOM_CHECKED_IN", label: "Room Checked In" },
  { value: "ROOM_CHECKED_OUT", label: "Room Checked Out" },
  { value: "BOOKING_CREATED", label: "Booking Created" },
  { value: "STOCK_LOW", label: "Stock Low" },
  { value: "STOCK_MOVEMENT", label: "Stock Movement" },
  { value: "TABLE_SESSION_STARTED", label: "Table Session Started" },
  { value: "TABLE_SESSION_CLOSED", label: "Table Session Closed" },
  { value: "WORKFLOW_STEP_CHANGED", label: "Workflow Step Changed" },
];

const ENTITY_TYPES = [
  { value: "all", label: "All Entities" },
  { value: "order", label: "Order" },
  { value: "invoice", label: "Invoice" },
  { value: "payment", label: "Payment" },
  { value: "room", label: "Room" },
  { value: "booking", label: "Booking" },
  { value: "table_session", label: "Table Session" },
  { value: "menu_item", label: "Menu Item" },
  { value: "product", label: "Product" },
  { value: "user", label: "User" },
  { value: "workflow", label: "Workflow" },
];

const PAGE_SIZE = 50;

function getSeverityFromEventType(eventType: string): string {
  const critical = ['PAYMENT_REVERSED', 'STOCK_LOW'];
  const warning = ['ORDER_STATUS_CHANGED', 'TABLE_SESSION_CLOSED', 'WORKFLOW_STEP_CHANGED'];
  if (critical.includes(eventType)) return 'critical';
  if (warning.includes(eventType)) return 'warning';
  return 'info';
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-600 dark:text-red-400';
    case 'warning': return 'text-amber-600 dark:text-amber-400';
    default: return 'text-green-600 dark:text-green-400';
  }
}

function exportToCsv(events: SystemEvent[]): void {
  const headers = ['Seq', 'Time', 'Event Type', 'Entity Type', 'Entity ID', 'Payload'];
  const rows = events.map((e, i) => [
    i + 1,
    new Date(e.created_at).toISOString(),
    e.event_type,
    e.entity_type,
    e.entity_id,
    JSON.stringify(e.payload ?? {}),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogPage() {
  const [eventFilter, setEventFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [traceSearch, setTraceSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [groupByType, setGroupByType] = useState(false);

  const { data: events, isLoading, isError, error: queryError } = useAuditLogs(500);

  const displayError = isError && queryError ? ((queryError as Error)?.message || "Failed to load audit logs") : null;

  const resetPagination = useCallback(() => {
    setDisplayCount(PAGE_SIZE);
  }, []);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return (events ?? []).filter((e: SystemEvent) => {
      if (eventFilter !== "all" && e.event_type !== eventFilter) return false;
      if (entityFilter !== "all" && e.entity_type !== entityFilter) return false;
      if (dateFrom && new Date(e.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(e.created_at) > new Date(dateTo + "T23:59:59")) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [
          e.entity_id?.toLowerCase() ?? "",
          e.entity_type?.toLowerCase() ?? "",
          e.event_type?.toLowerCase() ?? "",
          JSON.stringify(e.payload ?? {}).toLowerCase(),
        ];
        if (!fields.some((f) => f.includes(q))) return false;
      }
      if (traceSearch) {
        const q = traceSearch.toLowerCase();
        const payloadStr = JSON.stringify(e.payload ?? {}).toLowerCase();
        if (!payloadStr.includes(q)) return false;
      }
      return true;
    });
  }, [events, eventFilter, entityFilter, search, traceSearch, dateFrom, dateTo]);

  const groupedEvents = useMemo(() => {
    if (!groupByType) return null;
    const groups: Record<string, SystemEvent[]> = {};
    for (const e of filtered) {
      const key = e.event_type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return Object.entries(groups).sort(([, a], [, b]) => b.length - a.length);
  }, [filtered, groupByType]);

  const displayed = groupByType
    ? filtered
    : filtered.slice(0, displayCount);
  const hasMore = !groupByType && displayCount < filtered.length;

  const handleShowMore = () => {
    setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground">
            System events and state changes across all modules.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToCsv(filtered)} disabled={filtered.length === 0}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); resetPagination(); }}
          options={EVENT_TYPES}
          className="w-full sm:w-44"
        />
        <Select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); resetPagination(); }}
          options={ENTITY_TYPES}
          className="w-full sm:w-44"
        />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPagination(); }}
          placeholder="Search entity ID, type..."
          className="w-full sm:w-56"
        />
        <Input
          value={traceSearch}
          onChange={(e) => { setTraceSearch(e.target.value); resetPagination(); }}
          placeholder="Trace / correlation ID..."
          className="w-full sm:w-48"
        />
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPagination(); }}
            className="flex-1 sm:w-36"
          />
          <span className="text-muted-foreground shrink-0">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPagination(); }}
            className="flex-1 sm:w-36"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={groupByType}
            onChange={(e) => setGroupByType(e.target.checked)}
            className="rounded"
          />
          Group by type
        </label>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          {!groupByType && displayCount < filtered.length && ` (showing ${displayCount})`}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : displayError ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center space-y-2">
              <p className="text-destructive font-medium">Failed to load audit logs</p>
              <p className="text-sm text-muted-foreground">{displayError}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-primary hover:underline"
              >
                Reload page
              </button>
            </div>
          </CardContent>
        </Card>
      ) : groupedEvents ? (
        <div className="space-y-4">
          {groupedEvents.map(([type, groupEvents]) => (
            <Card key={type}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className={EVENT_COLORS[type] ?? "bg-gray-100 text-gray-800"}>
                      {type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{groupEvents.length} events</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Time</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Entity</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Entity ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupEvents.slice(0, 5).map((event: SystemEvent) => (
                        <tr key={event.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(event.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-xs">{event.entity_type}</td>
                          <td className="px-3 py-2 text-xs font-mono text-muted-foreground max-w-[150px] truncate">
                            {event.entity_id}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[250px] truncate">
                            {JSON.stringify(event.payload ?? {})}
                          </td>
                        </tr>
                      ))}
                      {groupEvents.length > 5 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground text-center">
                            ...and {groupEvents.length - 5} more
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
          {groupedEvents.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No events found matching filters.
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-8"></th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Seq</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Event Type</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Entity</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Entity ID</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        No events found. Events appear here when actions are performed in the system.
                      </td>
                    </tr>
                  ) : (
                    displayed.map((event: SystemEvent, idx: number) => {
                      const isExpanded = expandedRows.has(event.id);
                      const severity = getSeverityFromEventType(event.event_type);
                      return (
                        <tr key={event.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleRow(event.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(event.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${severityColor(severity)}`} />
                              <Badge className={EVENT_COLORS[event.event_type] ?? "bg-gray-100 text-gray-800"}>
                                {event.event_type}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{event.entity_type}</td>
                          <td className="px-4 py-3 text-sm font-mono text-muted-foreground max-w-[150px] truncate">
                            {event.entity_id}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground max-w-[250px] truncate">
                            {isExpanded ? (
                              <pre className="text-xs whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                {JSON.stringify(event.payload ?? {}, null, 2)}
                              </pre>
                            ) : (
                              <code className="text-xs">
                                {JSON.stringify(event.payload ?? {}).slice(0, 80)}
                                {JSON.stringify(event.payload ?? {}).length > 80 ? "..." : ""}
                              </code>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center p-4 border-t">
                <button
                  onClick={handleShowMore}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Show more ({filtered.length - displayCount} remaining)
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
