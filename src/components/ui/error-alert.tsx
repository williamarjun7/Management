import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorAlert({ message = 'Something went wrong', onRetry }: ErrorAlertProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Try Again
        </button>
      )}
    </div>
  );
}
