import { useEffect, useRef } from 'react';
import { createBridge } from '../events/bridge';
import { createTableGame } from './createTableGame';

/**
 * Hosts the Phaser table. One instance per mount; the disposer runs on unmount
 * (and on React StrictMode's double-invoke), so duplicates are never left behind.
 */
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dispose = createTableGame(el, createBridge());
    return dispose;
  }, []);

  return <div ref={ref} className="absolute inset-0 touch-none select-none" aria-label="Card table" role="application" />;
}
