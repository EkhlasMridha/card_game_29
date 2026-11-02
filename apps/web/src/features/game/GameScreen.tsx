import { useEffect, useState } from 'react';
import { cardName, type GameView, type RoomView } from '@twentynine/shared';
import { MiniCard } from '../../components/Cards';
import { Modal } from '../../components/Modal';
import { GameCanvas } from '../../game/phaser/GameCanvas';
import { computeLayout } from '../../game/scenes/layout';
import { t } from '../../i18n';
import { net } from '../../network/client';
import { seatName } from '../../network/eventText';
import { useStore } from '../../state/hooks';
import { Rulebook } from '../rules/Rulebook';
import { SettingsPanel } from '../settings/SettingsPanel';
import { DealSummary, MatchResult } from './DealSummary';
import { Hud } from './Hud';
import { BiddingPanel, DoublingPanel, TrumpPanel } from './PhasePanels';

interface ActionSpot {
  bottom: number;
  /** Width available for the buttons (the free corner beside the hand), or undefined above the hand. */
  width: number | undefined;
}

function useActionSpot(): ActionSpot {
  const [spot, setSpot] = useState(actionSpot);
  useEffect(() => {
    const onResize = () => setSpot(actionSpot());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return spot;
}

/** Bottom-right corner beside the hand when there is room (mirrors your plate), otherwise just above the hand. */
function actionSpot(): ActionSpot {
  const L = computeLayout(window.innerWidth, window.innerHeight, 1);
  return L.cornerPlate ? { bottom: 22, width: L.plateW } : { bottom: L.H - L.handTop + 8, width: undefined };
}

function ActionBar({ game, room }: { game: GameView; room: RoomView }) {
  const { bottom, width } = useActionSpot();
  const [peek, setPeek] = useState(false);
  const a = game.actions;
  const isBidder = game.contract?.bidder === game.yourSeat;
  if (game.phase !== 'PLAYING') return null;
  return (
    <div className="pointer-events-none absolute right-2 z-30 flex flex-col items-end gap-2 sm:right-4" style={{ bottom }}>
      {peek && game.lastTrick && (
        <div className="panel pointer-events-auto p-2.5 animate-pop">
          <p className="mb-1.5 text-[10px] tracking-widest text-white/50 uppercase">
            Last trick · {seatName(room, game.lastTrick.winner, game.yourSeat)} won {game.lastTrick.points} pt
          </p>
          <div className="flex gap-1">
            {game.lastTrick.plays.map((p) => (
              <div key={p.card} className="flex flex-col items-center gap-0.5">
                <MiniCard card={p.card} size={36} ring={p.seat === game.lastTrick!.winner} />
                <span className="max-w-12 truncate text-[9px] text-white/60">{seatName(room, p.seat, game.yourSeat)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="pointer-events-auto flex flex-wrap justify-end gap-2" style={{ maxWidth: width }}>
        {game.lastTrick && (
          <button className="btn-secondary min-h-10 px-3 text-xs" onClick={() => setPeek((v) => !v)} aria-pressed={peek}>
            Last trick
          </button>
        )}
        {a.canDeclarePair && (
          <button className="btn-primary min-h-10 animate-pop px-3 text-xs" onClick={() => net.send({ type: 'DECLARE_PAIR' })}>
            ♔♕ {t('declarePair')}
          </button>
        )}
        {a.canRequestReveal && (
          <button
            className={`btn-primary min-h-10 px-3 text-xs ${a.mustRequestReveal ? 'animate-pulse ring-2 ring-gold-300' : ''}`}
            onClick={() => net.send({ type: 'REQUEST_TRUMP_REVEAL' })}
          >
            {isBidder ? t('declareTrump') : t('revealTrump')}
          </button>
        )}
      </div>
    </div>
  );
}

function GameMenu({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const [view, setView] = useState<'menu' | 'rules' | 'settings'>('menu');
  if (view === 'rules')
    return (
      <Modal title="Rulebook" onClose={() => setView('menu')} wide>
        <Rulebook rules={room.rules} />
      </Modal>
    );
  if (view === 'settings')
    return (
      <Modal title={t('settings')} onClose={() => setView('menu')}>
        <SettingsPanel />
      </Modal>
    );
  return (
    <Modal title="Menu" onClose={onClose}>
      <div className="grid gap-2">
        <button className="btn-secondary justify-start" onClick={() => setView('rules')}>
          📖 Rules in play
        </button>
        <button className="btn-secondary justify-start" onClick={() => setView('settings')}>
          ⚙ {t('settings')}
        </button>
        <div className="my-1 rounded-xl bg-white/5 p-3 text-xs text-white/60">
          Room <span className="font-mono text-gold-300">{room.code}</span> · {room.name}
        </div>
        {room.youAreHost && (
          <button
            className="btn-danger justify-start"
            onClick={() => {
              net.send({ type: 'END_MATCH' });
              onClose();
            }}
          >
            End match and return everyone to the lobby
          </button>
        )}
        <button
          className="btn-secondary justify-start"
          onClick={() => {
            net.send({ type: 'LEAVE_ROOM' });
          }}
        >
          Leave table (your seat stays reserved until the host ends the match)
        </button>
      </div>
    </Modal>
  );
}

/** Screen-reader/keyboard access to the hand (the visual hand is drawn by Phaser). */
function AccessibleHand({ game }: { game: GameView }) {
  const legal = new Set(game.actions.legalCards);
  return (
    <div className="sr-only" aria-label="Your hand">
      <p>
        {game.turn === game.yourSeat ? 'Your turn.' : 'Waiting.'} Your hand: {game.yourHand.map(cardName).join(', ')}.
      </p>
      {game.currentTrick && game.currentTrick.plays.length > 0 && <p>On the table: {game.currentTrick.plays.map((p) => cardName(p.card)).join(', ')}.</p>}
      {game.yourHand
        .filter((c) => legal.has(c))
        .map((c) => (
          <button key={c} onClick={() => net.send({ type: 'PLAY_CARD', card: c })}>
            Play {cardName(c)}
          </button>
        ))}
    </div>
  );
}

export function GameScreen({ room }: { room: RoomView }) {
  const game = useStore((s) => s.game);
  const [menu, setMenu] = useState(false);

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink-950">
      <GameCanvas />
      {game ? (
        <>
          <Hud game={game} room={room} onMenu={() => setMenu(true)} />
          {game.phase === 'BIDDING' && <BiddingPanel game={game} room={room} />}
          {game.phase === 'TRUMP_SELECTION' && <TrumpPanel game={game} room={room} />}
          {game.phase === 'DOUBLING' && <DoublingPanel game={game} room={room} />}
          <ActionBar game={game} room={room} />
          {game.phase === 'DEAL_SUMMARY' && game.summary && <DealSummary game={game} room={room} />}
          {game.phase === 'MATCH_FINISHED' && <MatchResult game={game} room={room} />}
          <AccessibleHand game={game} />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/60">Synchronising…</div>
      )}
      {menu && <GameMenu room={room} onClose={() => setMenu(false)} />}
    </div>
  );
}
