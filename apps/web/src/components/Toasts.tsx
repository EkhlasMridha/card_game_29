import { useStore } from '../state/hooks';

const TONES = {
  info: 'border-white/15 bg-ink-800/95 text-white',
  success: 'border-team-a/40 bg-ink-800/95 text-emerald-100',
  warn: 'border-amber-400/40 bg-ink-800/95 text-amber-100',
  error: 'border-rose-400/50 bg-rose-950/95 text-rose-100',
  trump: 'border-gold-400/60 bg-ink-900/95 text-gold-300',
};

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[68px] z-[60] flex flex-col items-center gap-1.5 px-3 sm:right-auto sm:items-start sm:px-4"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-[min(92vw,22rem)] rounded-xl border px-3.5 py-1.5 text-sm font-medium shadow-xl backdrop-blur animate-rise ${TONES[t.tone]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
