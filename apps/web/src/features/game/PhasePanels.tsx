import { useEffect, useRef, useState } from 'react';
import { SUITS, SUIT_NAMES, teamOf, type GameView, type RoomView, type Seat } from '@twentynine/shared';
import { SuitIcon } from '../../components/Cards';
import { computeLayout } from '../../game/scenes/layout';
import { t } from '../../i18n';
import { net } from '../../network/client';
import { seatName } from '../../network/eventText';

/** The open felt between the HUD and the top of your hand, in CSS pixels. */
function usePlayArea(): { top: number; bottom: number } {
  const measure = () => {
    const L = computeLayout(window.innerWidth, window.innerHeight, 1);
    return { top: L.top + 8, bottom: L.handTop - 8 };
  };
  const [area, setArea] = useState(measure);
  useEffect(() => {
    const onResize = () => setArea(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return area;
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  const area = usePlayArea();
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center px-3"
      style={{ top: area.top, height: Math.max(220, area.bottom - area.top) }}
    >
      <div className="panel pointer-events-auto max-h-full w-[min(92vw,440px)] animate-pop overflow-y-auto p-4">
        <h2 className="mb-1.5 text-center font-display text-2xl leading-tight font-semibold text-gold-300">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function BiddingPanel({ game, room }: { game: GameView; room: RoomView }) {
  const b = game.bidding!;
  const name = (s: Seat | null) => seatName(room, s, game.yourSeat);
  const opts = b.yourOptions;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
  }, [opts?.minBid]);

  const values: number[] = [];
  if (opts) for (let v = opts.minBid; v <= opts.maxBid; v++) values.push(v);

  // The player who last named the amount (a challenger's raise or the holder's ditto).
  const lastNamed = [...b.history].reverse().find((h) => h.kind !== 'pass');
  const side = (s: Seat) => (teamOf(s) === teamOf(game.yourSeat) ? 'your side' : 'opponents');
  const status =
    b.highBid === null || !lastNamed
      ? 'No bids yet'
      : lastNamed.kind === 'ditto'
        ? `${name(lastNamed.seat)} ${lastNamed.seat === game.yourSeat ? 'hold' : 'holds'} at ${b.highBid} (${side(lastNamed.seat)})`
        : `Highest bid ${b.highBid} by ${name(lastNamed.seat)} (${side(lastNamed.seat)})`;

  return (
    <PanelShell title="Bidding">
      <p className="text-center text-sm text-white/80">{status}</p>
      {b.style === 'priority' && b.holder !== null && b.challenger !== null && (
        <p className="mt-0.5 text-center text-xs text-white/50">
          {name(b.holder)} {b.holder === game.yourSeat ? 'hold' : 'holds'} priority · {name(b.challenger)}{' '}
          {b.challenger === game.yourSeat ? 'are' : 'is'} challenging
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
        {([0, 1, 2, 3] as Seat[]).map((s) => {
          const last = [...b.history].reverse().find((h) => h.seat === s);
          const text = b.passed[s]
            ? 'Pass'
            : last?.kind === 'bid' || last?.kind === 'forced'
              ? String(last.amount)
              : last?.kind === 'ditto'
                ? `Hold ${last.amount}`
                : '…';
          return (
            <span
              key={s}
              className={`chip ${game.turn === s ? 'border-gold-400/70 text-gold-300' : ''} ${b.passed[s] ? 'opacity-50' : ''}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${teamOf(s) === 0 ? 'bg-team-a' : 'bg-team-b'}`} />
              {name(s)}: <strong>{text}</strong>
            </span>
          );
        })}
      </div>

      {opts ? (
        <div className="mt-3">
          <p className="mb-2 text-center text-xs font-semibold tracking-widest text-gold-300 uppercase">{t('yourTurn')}</p>
          {values.length > 0 ? (
            <div ref={scroller} className="grid grid-cols-7 gap-1.5" role="group" aria-label="Bid amount">
              {values.map((v) => (
                <button
                  key={v}
                  className="btn-secondary min-h-9 px-0 py-1.5 text-base tabular-nums"
                  onClick={() => net.send({ type: 'PLACE_BID', amount: v })}
                  aria-label={`Bid ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-white/50">No higher bid is possible.</p>
          )}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {opts.canDitto && b.highBid !== null ? (
              <button className="btn-primary" onClick={() => net.send({ type: 'DITTO_BID' })}>
                {t('ditto')} at {b.highBid}
              </button>
            ) : (
              <span />
            )}
            <button className="btn-secondary" onClick={() => net.send({ type: 'PASS_BID' })}>
              {t('pass')}
            </button>
          </div>
          {opts.canDitto && (
            <p className="mt-2 text-center text-[11px] text-white/50">You spoke earlier, so you have priority: hold by matching the bid, raise, or pass.</p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-white/60">Waiting for {name(game.turn)}…</p>
      )}
    </PanelShell>
  );
}

export function TrumpPanel({ game, room }: { game: GameView; room: RoomView }) {
  const c = game.contract!;
  if (!game.actions.canSelectTrump) {
    return (
      <PanelShell title="Choosing trump">
        <p className="text-center text-sm text-white/70">
          {seatName(room, c.bidder, game.yourSeat)} won the bidding at <strong>{c.bid}</strong> and is choosing trump in secret.
        </p>
      </PanelShell>
    );
  }
  return (
    <PanelShell title="Choose trump">
      <p className="mb-3 text-center text-sm text-white/70">
        You won the bidding at <strong>{c.bid}</strong>. Choose a trump suit, usually your strongest. It stays secret until someone has to ask for it.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {SUITS.map((s) => {
          const count = game.yourHand.filter((card) => card.endsWith(s)).length;
          return (
            <button
              key={s}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 py-3 transition hover:border-gold-400 hover:bg-gold-500/10"
              onClick={() => net.send({ type: 'SELECT_TRUMP', choice: s })}
              aria-label={`Trump ${SUIT_NAMES[s]}`}
            >
              <SuitIcon suit={s} size={34} light />
              <span className="text-xs text-white/80">{SUIT_NAMES[s]}</span>
              <span className="text-[10px] text-white/45">{count} in hand</span>
            </button>
          );
        })}
      </div>
      {room.rules.seventhCard && (
        <button className="btn-secondary mt-3 w-full" onClick={() => net.send({ type: 'SELECT_TRUMP', choice: 'SEVENTH' })}>
          Seventh card — let my 7th card decide
        </button>
      )}
    </PanelShell>
  );
}

export function DoublingPanel({ game, room }: { game: GameView; room: RoomView }) {
  const d = game.doubling!;
  const c = game.contract!;
  const stageWord = d.stage === 'double' ? t('double') : t('redouble');
  if (!game.actions.canDouble) {
    return (
      <PanelShell title={d.stage === 'double' ? 'Double?' : 'Redouble?'}>
        <p className="text-center text-sm text-white/70">
          Waiting for {seatName(room, d.awaiting, game.yourSeat)} to decide whether to {stageWord.toLowerCase()}…
        </p>
      </PanelShell>
    );
  }
  return (
    <PanelShell title={`${stageWord}?`}>
      <p className="mb-3 text-center text-sm text-white/70">
        {d.stage === 'double'
          ? `${seatName(room, c.bidder, game.yourSeat)} bid ${c.bid}. Double it if you think they will fail: the deal is then worth 2 game points.`
          : 'The opponents doubled. Redouble if you are confident: the deal is then worth 4 game points.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary" onClick={() => net.send({ type: 'DOUBLE_DECISION', double: true })}>
          {stageWord}
        </button>
        <button className="btn-secondary" onClick={() => net.send({ type: 'DOUBLE_DECISION', double: false })}>
          {d.stage === 'double' ? t('noDouble') : t('noRedouble')}
        </button>
      </div>
    </PanelShell>
  );
}
