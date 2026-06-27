interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'default' | 'lg';
}

export function LoadingSpinner({ text, size = 'default' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    default: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-3',
  };
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2" role="status" aria-live="polite">
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-primary border-t-transparent`} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}
