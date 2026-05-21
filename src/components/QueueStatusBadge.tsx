import { useState, useEffect } from "react";
import { Clock, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { getPendingCountSync, getFailedCountSync, clearCompletedMutationsSync } from "../lib/services/mutation-queue";
import { cn } from "../lib/core/utils";

export function QueueStatusBadge() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function update() {
      setPending(getPendingCountSync());
      setFailed(getFailedCountSync());
    }
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, []);

  if (pending === 0 && failed === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium min-h-[28px]",
          failed > 0
            ? "bg-red-100 text-red-800"
            : "bg-yellow-100 text-yellow-800"
        )}
      >
        {pending > 0 ? (
          <Clock className="h-3 w-3" />
        ) : (
          <AlertTriangle className="h-3 w-3" />
        )}
        {pending > 0 && <span>{pending} queued</span>}
        {failed > 0 && <span>{failed} failed</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border bg-background p-3 shadow-lg">
            <p className="text-sm font-medium mb-2">Mutation Queue</p>
            {pending > 0 && (
              <div className="flex items-center gap-2 text-sm text-yellow-700 mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{pending} mutation{pending > 1 ? "s" : ""} pending — will process when online</span>
              </div>
            )}
            {failed > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-700 mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span>{failed} mutation{failed > 1 ? "s" : ""} failed — may need manual review</span>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { clearCompletedMutationsSync(); setPending(getPendingCountSync()); setFailed(getFailedCountSync()); }}
                className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted min-h-[32px]"
              >
                <RefreshCw className="h-3 w-3" /> Clear completed
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
