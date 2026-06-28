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
  success: "border-green-500 bg-green-50 text-green-900",
  error: "border-red-500 bg-red-50 text-red-900",
  warning: "border-yellow-500 bg-yellow-50 text-yellow-900",
  info: "border-blue-500 bg-blue-50 text-blue-900",
  pending: "border-gray-500 bg-gray-50 text-gray-900",
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
    <div className="pointer-events-none fixed bottom-20 lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2 sm:max-w-sm">
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
