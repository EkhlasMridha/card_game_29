import { SUIT_NAMES, TEAM_NAMES, teamOf, type GameView, type RoomView, type Team } from '@card29/shared';
import { MiniCard, SuitIcon } from '../../components/Cards';
import { Modal } from '../../components/Modal';
import { t } from '../../i18n';
import { net } from '../../network/client';
import { formatServerText, seatName } from '../../network/eventText';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-sm">
      <span className="text-white/55">{label}</span>
      <span className="text-right font-medium text-white">{children}</span>
    </div>
  );
}

export function DealSummary({ game, room }: { game: GameView; room: RoomView }) {
  const s = game.summary!;
  const name = (seat: number | null) => (seat === null ? '—' : seatName(room, seat as 0, game.yourSeat));
  const bidderTeam: Team | null = s.bidder !== null ? teamOf(s.bidder) : null;
  const myTeam = teamOf(game.yourSeat);
  const finished = game.phase === 'MATCH_FINISHED';

  const footer = finished ? null : (
    <>
      <button className="btn-primary w-full" disabled={!game.actions.canContinue} onClick={() => net.send({ type: 'CONTINUE' })}>
        {game.actions.canContinue ? t('nextDeal') : 'Waiting for the other players…'}
      </button>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-white/50">
        {room.seats.map((seat) => (
          <span key={seat.seat} className={game.readyForNext[seat.seat] ? 'text-team-a' : ''}>
            {game.readyForNext[seat.seat] ? '✓' : '·'} {seat.isYou ? 'You' : seat.name}
          </span>
        ))}
      </div>
    </>
  );

  return (
    <Modal title={s.annulled ? `Deal ${s.dealNumber} annulled` : `Deal ${s.dealNumber} result`} footer={footer}>
      {s.annulled ? (
        <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {formatServerText(s.reason ?? '', room, game.yourSeat)} No game points are scored, and the same dealer deals again.
        </p>
      ) : (
        <div
          className={`mb-4 rounded-2xl p-4 text-center ${
            s.success ? 'bg-team-a/10 ring-1 ring-team-a/40' : 'bg-team-b/10 ring-1 ring-team-b/40'
          }`}
        >
          <p className="font-display text-3xl font-bold text-white">{s.success ? 'Contract made' : 'Contract failed'}</p>
          <p className="mt-1 text-sm text-white/70">
            Team {TEAM_NAMES[bidderTeam!]} ({bidderTeam === myTeam ? 'your side' : 'opponents'}){' '}
            {s.gamePoints > 0 ? `gains ${s.gamePoints}` : `loses ${-s.gamePoints}`} game point{Math.abs(s.gamePoints) === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <Row label="Contract">
        {s.bid !== null ? (
          <>
            {s.bid} by {name(s.bidder)}
            {s.doubleLevel > 0 && <span className="ml-1 text-rose-300">{s.doubleLevel === 1 ? 'doubled' : 'redoubled'}</span>}
          </>
        ) : (
          '—'
        )}
      </Row>
      <Row label="Trump">
        {s.trump ? (
          <span className="inline-flex items-center gap-1.5">
            <SuitIcon suit={s.trump} size={16} light /> {SUIT_NAMES[s.trump]}
            {s.seventhCard && <span className="text-white/50">(seventh card)</span>}
          </span>
        ) : (
          '—'
        )}
      </Row>
      {!s.annulled && (
        <>
          <Row label="Card points">
            <span className="text-team-a">{TEAM_NAMES[0]} {s.cardPoints[0]}</span>
            <span className="mx-2 text-white/30">·</span>
            <span className="text-team-b">{TEAM_NAMES[1]} {s.cardPoints[1]}</span>
          </Row>
          <Row label="King–Queen pair">{s.pair ? `${name(s.pair.declaredBy)}: ${s.pair.adjustment > 0 ? '+' : ''}${s.pair.adjustment}` : 'None declared'}</Row>
          <Row label="Last-trick bonus">{s.lastTrickBonus ? `+1 to ${TEAM_NAMES[s.lastTrickBonus.team]}` : 'Not used'}</Row>
          <Row label="Target">
            {s.target} needed, {bidderTeam !== null ? s.cardPoints[bidderTeam] : 0} taken
          </Row>
        </>
      )}
      <Row label="Match score">
        <span className="text-team-a">{TEAM_NAMES[0]} {s.scoresAfter[0]}</span>
        <span className="mx-2 text-white/30">·</span>
        <span className="text-team-b">{TEAM_NAMES[1]} {s.scoresAfter[1]}</span>
      </Row>

      {game.lastTrick && !s.annulled && (
        <div className="mt-3">
          <p className="label">Last trick — won by {name(game.lastTrick.winner)}</p>
          <div className="flex gap-1.5">
            {game.lastTrick.plays.map((p) => (
              <MiniCard key={p.card} card={p.card} size={42} ring={p.seat === game.lastTrick!.winner} />
            ))}
          </div>
        </div>
      )}

    </Modal>
  );
}

export function MatchResult({ game, room }: { game: GameView; room: RoomView }) {
  const winner = game.matchWinner!;
  const youWon = winner === teamOf(game.yourSeat);
  const s = game.summary;
  return (
    <Modal title="Match complete">
      <div className="text-center">
        <p className="text-sm tracking-[0.3em] text-white/50 uppercase">{youWon ? 'Victory' : 'Defeat'}</p>
        <p className={`mt-1 font-display text-5xl font-bold ${winner === 0 ? 'text-team-a' : 'text-team-b'}`}>Team {TEAM_NAMES[winner]} wins</p>
        <p className="mt-2 text-white/70">
          {room.seats
            .filter((x) => teamOf(x.seat) === winner)
            .map((x) => x.name)
            .join(' & ')}
        </p>
        <div className="mt-5 flex justify-center gap-6 text-2xl font-bold tabular-nums">
          <span className="text-team-a">{game.scores[0]}</span>
          <span className="text-white/30">:</span>
          <span className="text-team-b">{game.scores[1]}</span>
        </div>
        {s && !s.annulled && (
          <p className="mt-2 text-xs text-white/50">
            Final deal: {s.bid} by {seatName(room, s.bidder, game.yourSeat)}, {s.success ? 'made' : 'failed'}.
          </p>
        )}
      </div>
      <div className="mt-6 grid gap-2">
        {room.youAreHost ? (
          <>
            <button className="btn-primary" onClick={() => net.send({ type: 'END_MATCH' })}>
              Back to lobby (play again)
            </button>
            <button className="btn-danger" onClick={() => net.send({ type: 'CLOSE_ROOM' })}>
              Close room
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-white/60">The host can return everyone to the lobby for another match.</p>
            <button className="btn-secondary" onClick={() => net.send({ type: 'LEAVE_ROOM' })}>
              Leave room
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
