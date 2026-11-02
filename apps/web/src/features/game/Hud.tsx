import { SUIT_NAMES, TEAM_NAMES, teamOf, type GameView, type RoomView } from '@twentynine/shared';
import { SuitIcon } from '../../components/Cards';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { seatName } from '../../network/eventText';

const PHASE_LABEL: Record<GameView['phase'], string> = {
  BIDDING: 'Bidding',
  TRUMP_SELECTION: 'Choosing trump',
  DOUBLING: 'Doubling',
  PLAYING: 'Playing',
  DEAL_SUMMARY: 'Deal complete',
  MATCH_FINISHED: 'Match over',
};

export function Hud({ game, room, onMenu }: { game: GameView; room: RoomView; onMenu: () => void }) {
  const c = game.contract;
  const myTeam = teamOf(game.yourSeat);
  const trump = game.trump;
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-[60px] items-center gap-2 border-b border-white/10 bg-ink-950/85 px-2 backdrop-blur sm:gap-4 sm:px-4">
      <button className="btn-secondary min-h-10 shrink-0 px-3" onClick={onMenu} aria-label="Game menu">
        ☰
      </button>

      <div className="hidden min-w-0 shrink-0 flex-col leading-tight sm:flex">
        <span className="text-[10px] tracking-widest text-white/45 uppercase">Deal {game.dealNumber}</span>
        <span className="text-sm font-semibold text-white">{PHASE_LABEL[game.phase]}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-3">
        {c ? (
          <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1 sm:px-3">
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[10px] tracking-wider text-white/50 uppercase">
                {c.bidder === game.yourSeat
                  ? 'Your contract'
                  : `${seatName(room, c.bidder, game.yourSeat)} · ${teamOf(c.bidder) === myTeam ? 'partner' : 'opponents'}`}
              </div>
              <div className="text-sm font-semibold text-white">
                Bid {c.bid}
                {c.target !== c.bid && <span className="text-gold-300"> → need {c.target}</span>}
                {c.doubleLevel > 0 && <span className="ml-1 text-rose-300">{c.doubleLevel === 1 ? '×2' : '×4'}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 border-l border-white/10 pl-2" title="Trump">
              {trump.suit ? (
                <>
                  <SuitIcon suit={trump.suit} size={22} light />
                  <span className="hidden text-xs text-white/70 md:inline">
                    {SUIT_NAMES[trump.suit]}
                    {!trump.revealed && ' (only you know)'}
                  </span>
                </>
              ) : (
                <span className="text-xs text-white/60">{trump.chosen ? 'Trump hidden' : '—'}</span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-sm text-white/60">
            {game.phase === 'BIDDING' && game.bidding?.highBid ? `High bid ${game.bidding.highBid}` : PHASE_LABEL[game.phase]}
          </span>
        )}
        {game.phase === 'PLAYING' && (
          <span className="hidden rounded-lg bg-white/5 px-2 py-1 text-xs text-white/70 sm:inline">Trick {game.trickNumber}/8</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {([0, 1] as const).map((team) => (
          <div
            key={team}
            className={`flex flex-col items-center rounded-xl px-2 py-0.5 leading-tight ${team === myTeam ? 'bg-white/10 ring-1 ring-white/15' : ''}`}
            title={`${TEAM_NAMES[team]} — ${team === myTeam ? 'your team' : 'opponents'}`}
          >
            <span className={`text-[9px] font-bold tracking-widest uppercase ${team === 0 ? 'text-team-a' : 'text-team-b'}`}>
              {TEAM_NAMES[team]}
            </span>
            <span className="text-lg font-bold tabular-nums text-white">{game.scores[team] > 0 ? `+${game.scores[team]}` : game.scores[team]}</span>
            {game.phase === 'PLAYING' && (
              <span className="text-[9px] text-white/50 tabular-nums">
                {game.cardPointsWon[team]} pts · {game.tricksWon[team]} tr
              </span>
            )}
          </div>
        ))}
        <ConnectionBadge compact />
      </div>
    </header>
  );
}
