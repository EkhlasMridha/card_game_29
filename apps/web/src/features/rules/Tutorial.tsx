import { useState, type ReactNode } from 'react';
import type { CardId } from '@twentynine/shared';
import { MiniCard } from '../../components/Cards';
import { Screen } from '../../components/Screen';

interface Step {
  title: string;
  body: ReactNode;
  hand?: CardId[];
  legal?: CardId[];
  table?: { who: string; card: CardId; win?: boolean }[];
}

const FINAL_HAND: CardId[] = ['JH', '9H', '10H', 'KH', 'QH', 'AD', '7S', '8C'];

/** A guided sample deal under the default Bangladesh rules. */
const STEPS: Step[] = [
  {
    title: 'Your first four cards',
    body: (
      <>
        You sit to the dealer's right, so you speak first. Your four cards hold <strong>6 card points</strong>: Jack (3) + Nine (2) + Ace (1). The Jack and
        Nine of Hearts are the two highest Hearts, which makes Hearts a strong trump candidate.
      </>
    ),
    hand: ['JH', '9H', 'AD', '7S'],
  },
  {
    title: 'Bidding with priority',
    body: (
      <>
        You open at <strong>16</strong>, the minimum. The next player challenges with 17. Because you spoke earlier you have priority: you <strong>hold</strong>{' '}
        (ditto) at 17 instead of bidding 18. They pass. Your partner passes, and the dealer challenges with 18. You hold at 18 again and the dealer passes.{' '}
        <strong>You win the contract at 18</strong>: your side must take at least 18 of the 28 card points.
      </>
    ),
    hand: ['JH', '9H', 'AD', '7S'],
  },
  {
    title: 'Choosing trump secretly',
    body: (
      <>
        You choose <strong>Hearts</strong> as trump. Nobody else knows the suit. They only see a face-down trump marker beside you. You could instead have called
        the <em>seventh card</em>, letting the 7th card dealt to you decide trump. The opponents may now double; here they decline.
      </>
    ),
    hand: ['JH', '9H', 'AD', '7S'],
  },
  {
    title: 'The rest of the deal',
    body: (
      <>
        Four more cards arrive. You now hold five Hearts, including the <strong>King and Queen of trumps</strong>, which is a potential pair.
      </>
    ),
    hand: FINAL_HAND,
  },
  {
    title: 'Trick 1 — leading',
    body: (
      <>
        As the first player after the dealer you lead the first trick, and any card is legal when leading. You lead the <strong>Ace of Diamonds</strong>. Everyone
        follows with diamonds, and the Ace beats the Ten, 8 and 7. You win 2 points (Ace 1 + Ten 1).
      </>
    ),
    hand: FINAL_HAND,
    legal: FINAL_HAND,
    table: [
      { who: 'You', card: 'AD', win: true },
      { who: 'Right', card: '7D' },
      { who: 'Partner', card: '10D' },
      { who: 'Left', card: '8D' },
    ],
  },
  {
    title: 'Tricks 2–3 — following suit',
    body: (
      <>
        You lead the 7 of Spades. The right-hand opponent wins with the Jack of Spades. Next they lead the <strong>Jack of Clubs</strong>. You hold the 8 of
        Clubs, so you <strong>must follow suit</strong>: it is your only legal card (the others are dimmed).
      </>
    ),
    hand: ['JH', '9H', '10H', 'KH', 'QH', '8C'],
    legal: ['8C'],
    table: [
      { who: 'Right', card: 'JC' },
      { who: 'Partner', card: '9C' },
      { who: 'Left', card: '7C' },
    ],
  },
  {
    title: 'Trick 4 — asking for trump',
    body: (
      <>
        The Jack of Clubs wins, so the right-hand opponent leads again: the 10 of Spades. Partner and left follow with Spades, and you have none left. Trump is still hidden, so under the default (mandatory) rule the first
        player who cannot follow must ask for trump. As the bidder, you reveal <strong>Hearts</strong> to everyone. Now you may play any card, and you trump with
        the <strong>Queen of Hearts</strong>. Even a low trump beats every non-trump card.
      </>
    ),
    hand: ['JH', '9H', '10H', 'KH', 'QH'],
    legal: ['JH', '9H', '10H', 'KH', 'QH'],
    table: [
      { who: 'Right', card: '10S' },
      { who: 'Partner', card: '8S' },
      { who: 'Left', card: 'KS' },
      { who: 'You', card: 'QH', win: true },
    ],
  },
  {
    title: 'The King–Queen pair',
    body: (
      <>
        Hmm, you just played the Queen of Hearts! You can only declare the pair while you still <strong>hold both</strong> King and Queen of trumps. Had you
        trumped with the 10 of Hearts instead, you could have declared it after this trick. Even then, in the Bangladesh rules your 18 bid would gain nothing:
        the bidding side's pair only lowers the target for bids of 19 or more (19 or 20 → 16, 21 → 17, and so on). An opponents' pair raises your target by 4.
      </>
    ),
    hand: ['JH', '9H', '10H', 'KH'],
  },
  {
    title: 'Counting the deal',
    body: (
      <>
        Play continues to the eighth trick. Your side ends with <strong>20 card points</strong> against 8: at least the 18 you bid, so your team gains{' '}
        <strong>+1 game point</strong>. Had you taken only 17, your team would have lost a game point. The opponents' score never changes on your contract.
        The first team to +6 wins the match, and a team that drops to −6 loses.
      </>
    ),
  },
];

export function Tutorial({ onBack }: { onBack: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const legal = step.legal ? new Set(step.legal) : null;
  return (
    <Screen title="How to Play" onBack={onBack}>
      <div className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="chip">
            Step {i + 1} / {STEPS.length}
          </span>
          <div className="flex gap-1">
            {STEPS.map((_, k) => (
              <span key={k} className={`h-1.5 w-5 rounded-full ${k <= i ? 'bg-gold-400' : 'bg-white/15'}`} />
            ))}
          </div>
        </div>
        <h2 className="mb-2 font-display text-3xl font-semibold text-gold-300">{step.title}</h2>
        <p className="text-sm leading-relaxed text-white/80">{step.body}</p>

        {step.table && (
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-felt-500/50 to-felt-700/70 p-4 ring-1 ring-gold-500/20">
            <p className="mb-2 text-[10px] tracking-widest text-white/60 uppercase">On the table</p>
            <div className="flex flex-wrap gap-3">
              {step.table.map((p) => (
                <div key={p.card} className="flex flex-col items-center gap-1">
                  <MiniCard card={p.card} size={52} ring={p.win} />
                  <span className={`text-[11px] ${p.win ? 'font-semibold text-gold-300' : 'text-white/70'}`}>{p.who}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step.hand && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] tracking-widest text-white/50 uppercase">Your hand</p>
            <div className="flex flex-wrap gap-1.5">
              {step.hand.map((c) => (
                <MiniCard key={c} card={c} size={50} dim={legal ? !legal.has(c) : false} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <button className="btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}>
            ← Previous
          </button>
          {i < STEPS.length - 1 ? (
            <button className="btn-primary" onClick={() => setI(i + 1)}>
              Next →
            </button>
          ) : (
            <button className="btn-primary" onClick={onBack}>
              Done
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}
