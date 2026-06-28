import { useEffect, useRef } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="relative w-full max-h-[85vh] bg-background rounded-t-2xl shadow-xl animate-bottom-sheet-in overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-border">
          <div className="flex-1">
            <button
              tabIndex={0}
              aria-label="Close dialog"
              className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 mb-3 cursor-pointer"
              onClick={onClose}
            />
            {title && (
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors -mr-1.5 -mt-1"
            aria-label="Close dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(85vh-56px)] px-2 py-2">
          {children}
        </div>
      </div>
    </div>
  );
}
