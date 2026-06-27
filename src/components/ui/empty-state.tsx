import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      {icon && <div className="mb-3">{icon}</div>}
      {title && <p className="text-sm font-medium">{title}</p>}
      {description && <p className="text-xs mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
