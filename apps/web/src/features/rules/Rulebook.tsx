import type { ReactNode } from 'react';
import { CARD_POINTS, RANK_NAMES, describeRules, maxBid, type CardId, type Rank, type RulesConfig } from '@card29/shared';
import { MiniCard } from '../../components/Cards';

const ORDER: Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 font-display text-2xl font-semibold text-gold-300">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-white/80">{children}</div>
    </section>
  );
}

/** In-app rulebook. Text adapts to the configured ruleset so players know exactly which version is in play. */
export function Rulebook({ rules }: { rules: RulesConfig }) {
  const dir = rules.direction === 'clockwise' ? 'clockwise' : 'counter-clockwise';
  const nextWord = rules.direction === 'clockwise' ? 'left' : 'right';
  const max = maxBid(rules);
  return (
    <div>
      <div className="mb-6 rounded-xl border border-gold-400/30 bg-gold-500/5 p-3">
        <p className="label text-gold-300">Ruleset in use</p>
        <ul className="grid gap-x-4 text-xs text-white/75 sm:grid-cols-2">
          {describeRules(rules).map((l) => (
            <li key={l}>• {l}</li>
          ))}
        </ul>
      </div>

      <Section title="Deck & card values">
        <p>
          A 32-card deck: 7, 8, 9, 10, J, Q, K and A in each suit. In every suit the cards rank, from highest to lowest:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ORDER.map((r) => (
            <div key={r} className="flex flex-col items-center gap-0.5">
              <MiniCard card={`${r}S` as CardId} size={40} />
              <span className="text-[10px] text-white/60">{CARD_POINTS[r]} pt</span>
            </div>
          ))}
        </div>
        <p>
          Jack 3, Nine 2, Ace 1, Ten 1, King/Queen/8/7 0. The deck holds <strong>28 card points</strong>
          {rules.lastTrickBonus ? ', plus 1 for winning the last trick (29 in total).' : '. The last trick earns nothing extra in this ruleset.'}{' '}
          Card points decide whether a contract is made. <em>Game points</em> are the match score.
        </p>
      </Section>

      <Section title="Teams & seating">
        <p>
          Four players form two partnerships. Partners sit opposite each other (Emerald vs. Crimson), and seats stay fixed for the match. Dealing, bidding and play go {dir}. After each scored deal the turn to deal passes to the {nextWord}.
        </p>
      </Section>

      <Section title="Dealing">
        <p>
          The dealer gives four cards to each player. After the bidding and trump selection, everyone receives four more, for eight cards each.
          {rules.redealFirstTwoNoPoints && ' If either of the first two players to the dealer’s ' + nextWord + ' has no point card (J, 9, A, 10) among the first four, the cards are redealt.'}
        </p>
      </Section>

      <Section title="Bidding">
        {rules.biddingStyle === 'priority' ? (
          <>
            <p>
              The player to the dealer’s {nextWord} speaks first and must open with at least <strong>{rules.minBid}</strong> or pass. Bidding then runs between two players at a time. The challenger must bid higher than the current bid or pass. The earlier speaker has priority and may <strong>hold</strong> (match the bid, “ditto”), raise, or pass.
            </p>
            <p>
              Whoever passes drops out, and the next player in turn becomes the new challenger. A partner may take over for the team, and may even bid over their own partner. The last player holding the bid wins it. The maximum bid is {max}.
            </p>
          </>
        ) : (
          <p>
            Starting to the dealer’s {nextWord}, each player bids higher than the current bid (minimum {rules.minBid}, maximum {max}) or passes. Once you pass, you are out. The auction ends when three players have passed after a bid.
          </p>
        )}
        <p>
          {rules.allPass === 'redeal'
            ? 'If the first three players all pass, the deal is annulled and redealt (the dealer may not bid).'
            : `If the first three players all pass, the dealer must take the contract at ${rules.minBid}.`}
        </p>
      </Section>

      <Section title="Choosing trump">
        <p>
          The winning bidder secretly chooses a trump suit. Only the bidder knows it. Everyone else sees a face-down trump marker.
          {rules.seventhCard &&
            ' Instead, the bidder may call the “seventh card”: the seventh card dealt to them is set face down and its suit becomes trump. The bidder may look at it. It does not count as part of the hand for following suit, and it cannot be led before trump is revealed unless it is the bidder’s last card.'}
        </p>
        {rules.doubling !== 'off' && (
          <p>
            Before the last four cards are dealt, the opponents may <strong>double</strong> (the deal is worth 2 game points)
            {rules.doubling === 'redouble' && '. The bidding side may then redouble (worth 4)'}.
          </p>
        )}
        {rules.redealSeventhCardWeak && (
          <p>
            A seventh-card deal is annulled if the bidder holds no point-scoring trump besides the seventh card, or if the opponents hold no trumps or only the 7 of trumps.
          </p>
        )}
      </Section>

      <Section title="Play & hidden trump">
        <p>
          The player to the dealer’s {nextWord} leads the first trick. You must follow the suit led if you can. The highest trump wins the trick. If no trump is played, the highest card of the suit led wins. The winner leads the next trick.
        </p>
        {rules.revealMode === 'mandatory' ? (
          <p>
            If you cannot follow suit while trump is still hidden, you <strong>must ask for trump to be revealed</strong> (if you are the bidder, you reveal it). Once it is shown, you may play any card. Nobody is forced to trump. Trump cards played earlier in that same trick also count as trumps.
          </p>
        ) : (
          <p>
            If you cannot follow suit while trump is hidden, you may discard any card without asking, or ask for trump. If you ask, you must then play a trump if you have one. Trump cards played earlier in that trick also count as trumps.
          </p>
        )}
        <p>If trump is never revealed during all eight tricks, the deal is annulled.</p>
      </Section>

      {rules.pair.enabled && (
        <Section title="King–Queen pair">
          <p>
            A player holding both the King and Queen of trumps may declare the pair once trump is revealed,{' '}
            {rules.pair.timing === 'afterRevealTrick'
              ? 'at any time after the trick in which trump was revealed has finished. Both cards must still be in hand, and the team does not need to have won a trick.'
              : 'immediately after their side wins a trick (the reveal trick or a later one), before the next card is played. Both cards must still be in hand.'}
          </p>
          <p>
            If the bidding side holds the pair, their target drops by {rules.pair.bidderReduction} (never below {rules.pair.minTarget})
            {rules.pair.bidderMinBid > rules.minBid && `, but only when the bid is ${rules.pair.bidderMinBid} or more. Bids of ${rules.minBid}–${rules.pair.bidderMinBid - 1} gain nothing`}
            . If the opponents hold it, the bidders’ target rises by {rules.pair.opponentIncrease} (never above {max}).
          </p>
        </Section>
      )}

      <Section title="Scoring & winning">
        <p>
          After eight tricks each side counts its card points. If the bidding side reached its target, it gains 1 game point; if not, it loses 1 (×2 if doubled, ×4 if redoubled). The opponents’ score does not change.
        </p>
        <p>
          A team wins the match by reaching <strong>+{rules.matchTarget}</strong>. A team that falls to −{rules.matchTarget} loses.
        </p>
      </Section>

      <Section title="Not implemented in this version">
        <p className="text-white/60">
          Single hand, no-trump/Joker contracts, reversed rankings, “ditto” in the Lucknow style and other regional variants are not included. See docs/rules.md for sources and details.
        </p>
      </Section>

      <p className="text-xs text-white/40">Card names: {ORDER.map((r) => RANK_NAMES[r]).join(', ')}.</p>
    </div>
  );
}
