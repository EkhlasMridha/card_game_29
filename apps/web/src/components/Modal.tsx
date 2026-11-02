import { useEffect, type ReactNode } from 'react';

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  /** Pinned below the scrolling body, so the primary action is always visible. */
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 animate-fade" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`panel flex max-h-[92vh] w-full flex-col animate-pop ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="font-display text-2xl font-semibold text-gold-300">{title}</h2>
          {onClose && (
            <button className="btn-secondary min-h-9 px-3 py-1" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-white/10 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
