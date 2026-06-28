import { useEffect, useState, useCallback } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import { cn } from "../../lib/core/utils";

type ToastVariant = "success" | "error" | "warning" | "info" | "pending";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

let addToastFn: ((t: Omit<Toast, "id">) => void) | null = null;

export function toast(message: string, variant: ToastVariant = "info", duration?: number) {
  if (addToastFn) addToastFn({ message, variant, duration });
}

const icons: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  pending: Loader2,
};

const styles: Record<ToastVariant, string> = {
  success: "border-primary/20 bg-primary/10 text-primary-foreground dark:bg-primary/20",
  error: "border-destructive/20 bg-destructive/10 text-destructive-foreground dark:bg-destructive/20",
  warning: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  info: "border-border bg-card text-card-foreground",
  pending: "border-border bg-card text-muted-foreground",
};

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: string) => void }) {
  const Icon = icons[t.variant];

  useEffect(() => {
    if (t.variant === "pending") return;
    const timer = setTimeout(() => onRemove(t.id), t.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [t.id, t.variant, t.duration, onRemove]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border-2 px-4 py-3 shadow-lg min-h-[48px]",
        styles[t.variant],
        t.variant === "pending" && "animate-pulse"
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", t.variant === "pending" && "animate-spin")} />
      <p className="flex-1 text-sm font-medium">{t.message}</p>
      <button
        onClick={() => onRemove(t.id)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  return (
    <div role="region" aria-live="polite" aria-label="Notifications" className="pointer-events-none fixed bottom-20 lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2 sm:max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onRemove={removeToast} />
      ))}
    </div>
  );
}

export function showError(message: string) {
  toast(message, "error");
}

export function showSuccess(message: string) {
  toast(message, "success");
}

export function showWarning(message: string) {
  toast(message, "warning");
}

export function showPending(message: string) {
  toast(message, "pending");
}

export function showInfo(message: string) {
  toast(message, "info");
}
