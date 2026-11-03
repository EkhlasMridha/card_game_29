import { useEffect, useState } from 'react';
import { net } from '../network/client';
import { useStore } from '../state/hooks';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Shown over the lobby / table while the connection is down. Your seat is kept
 * on the server; the client reconnects on its own (immediately when the internet
 * comes back), and "Retry now" forces an attempt.
 */
export function ReconnectBanner() {
  const connection = useStore((s) => s.connection);
  const online = useOnline();
  if (connection === 'open' || connection === 'connecting') return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3" role="alert">
      <div className="pointer-events-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-amber-400/40 bg-[#1d1a0e]/95 px-4 py-2.5 text-sm text-amber-100 shadow-xl backdrop-blur">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
        <span className="min-w-0 flex-1">
          {online
            ? 'Connection lost. Reconnecting… your seat is kept.'
            : 'You are offline. Your seat is kept and the game reconnects when your internet is back.'}
        </span>
        {online && (
          <button className="btn-secondary min-h-8 px-3 py-1 text-xs" onClick={() => net.poke()}>
            Retry now
          </button>
        )}
      </div>
    </div>
  );
}
