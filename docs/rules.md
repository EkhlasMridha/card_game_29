# Card 29 — Rules specification

This document records the rules the engine implements, the sources they come from,
where sources disagree, and how each disagreement became a configurable option.

## Sources

| Source | Status during research | Use |
|---|---|---|
| [pagat.com/jass/29.html](https://www.pagat.com/jass/29.html) | Accessible | Primary source: standard rules, plus a dedicated **Bangladesh** section and many regional variants |
| [29cardgame.net/learn/29-rules](https://29cardgame.net/learn/29-rules/) | **Not accessible** (expired TLS certificate at research time) | Not used |
| gambiter.com/cards/jass/29.html | Not consulted separately; it mirrors pagat's older text | — |
| 29cardgame.firebaseapp.com | An online implementation; not treated as a rules authority | — |

Online implementations were deliberately **not** used as rule sources. Where pagat
is silent, the gap is listed under *Uncertainties* below instead of being filled by
invention.

## Fixed rules (all presets)

* **Deck:** 32 cards, 7 8 9 10 J Q K A in ♥ ♦ ♣ ♠.
* **Rank (every suit):** J > 9 > A > 10 > K > Q > 8 > 7.
* **Card points:** J 3, 9 2, A 1, 10 1, others 0. 28 in total (29 with the last-trick option).
* **Players:** 4, in two partnerships seated opposite. Seats 0+2 = *Emerald*, 1+3 = *Crimson*.
* **Deal:** four cards each, one at a time, starting with the player after the dealer.
  After the auction and trump choice, four more each.
* **Lead:** the player after the dealer leads trick 1. The trick winner leads the next trick.
* **Follow suit** when able. The highest trump wins, or else the highest card of the suit led.
* **Card points vs. game points:** card points (captured cards) decide the contract.
  Game points are the match score. They are separate types in the engine.

## Rule matrix

| Topic | Standard (pagat main text) | Bangladesh (pagat §Bangladesh) | Engine option → BD default |
|---|---|---|---|
| Direction | Clockwise ("some regions counter-clockwise") | Counter-clockwise | `direction` → `counterclockwise` |
| Minimum bid | 15 (max 28/29) | 16 | `minBid` → `16` |
| Auction | Bid higher or pass until 3 consecutive passes | Two at a time; first bidder may "ditto" to stay in; partner may take over; 4th may bid over partner | `biddingStyle` → `priority` |
| First three pass | Dealer forced to 15 | Annulled; dealer may not bid | `allPass` → `redeal` |
| Trump choice | Card placed face down | Choose trump or call seventh card | — |
| Seventh card | Optional variant | Allowed | `seventhCard` → `true` |
| Asking for trump | First player unable to follow **must** ask; nobody then obliged to trump | Not specified → standard used | `revealMode` → `mandatory` |
| Voluntary variant | May discard without asking; asker must trump if able | — | `revealMode: voluntary` |
| Pair timing | Immediately after own side wins a trick (reveal trick or later) | Any time after the reveal trick ends; no trick win needed | `pair.timing` → `afterRevealTrick` |
| Bidders' pair | −4, min 15 (variant: min 16) | Only if bid > 18: 19/20 → 16, 21 → 17 … | `pair.bidderMinBid 19`, `pair.minTarget 16`, `pair.bidderReduction 4` |
| Opponents' pair | +4, max 28 | Not specified → standard used | `pair.opponentIncrease 4` |
| Last trick | Optional +1 ("most players do not") | Not mentioned | `lastTrickBonus` → `false` |
| Double / redouble | Opponent may double (×2); bidders may redouble (×4) | Same | `doubling` → `redouble` |
| No-point redeal | — | Annul if either of the first two players has no point card in the first four | `redealFirstTwoNoPoints` → `true` |
| Weak seventh card | — | Annul if caller has no point trump besides the 7th card, or opponents have no trump / only the 7 | `redealSeventhCardWeak` → `true` |
| Trump never revealed | Deal annulled | — | always on |
| Scoring | Bidders ±1 (×2/×4); opponents unchanged | Same | — |
| Match | First to +6 wins, −6 loses | Same | `matchTarget` → `6` (4–12) |

The **Standard** preset applies the pagat main text: clockwise, min 15, open auction,
dealer forced, standard pair timing, any bid benefits, min target 15.

## Precise engine behaviour

### Priority auction (`biddingStyle: priority`)
1. Speaking order is P1 (after the dealer), P2, P3, P4 (dealer).
2. With no bid yet, the speaker opens (≥ `minBid`) or passes. If P1–P3 all pass, see `allPass`.
3. Once there is a bid, its **holder** faces one **challenger**, the next unheard player in order.
4. The challenger must bid **higher** or pass.
5. The holder (who spoke earlier, so has priority) may **ditto** (equal the bid), raise, or pass.
6. A player who passes is out. If the holder passes, the challenger becomes the holder.
   The next unheard player then becomes the challenger.
7. When no unheard players remain, the holder wins at the current bid.

Partners may bid over each other at every step (pagat: "the fourth player may bid over a partner").

### Open auction (`biddingStyle: open`)
Players speak in order. Each bids above the current bid or passes, and a passed player is out.
The auction ends when only one player is left and a bid exists.

### Trump & hidden information
* A named suit is stored only on the server. The bidder's snapshot includes it, and no one else's does.
* **Seventh card:** after the final deal, the bidder's 7th card dealt (the third card of the second round) is removed from the hand and set face down. Its suit is trump.
  It is not part of the hand for following suit. It can be led only as the bidder's last card, and leading it reveals trump.
  When trump is revealed it returns to the bidder's hand.
* Pagat's standard places the indicator from the unused low cards, so **any suit** may be named. The engine does not require the bidder to hold the suit.

### Reveal
* `mandatory`: a player void in the led suit while trump is hidden has only one legal action, asking for trump.
  After the reveal they may play any card. If that player is the bidder, they declare trump themselves.
* `voluntary`: a void player may discard or ask. After asking, they must play a trump if they hold one.
* Trump counts from the trick in which it is revealed. Trump-suit cards played earlier in that trick become trumps.

### Pair
Declarable once per deal by the player holding the K and Q of trumps **in hand**, after trump is revealed, subject to `pair.timing`.
The target becomes `max(minTarget, target − 4)` for the bidders (only if `bid ≥ bidderMinBid`), or `min(maxBid, target + 4)` for the opponents.

### Scoring
`success = bidderCardPoints ≥ target`. Game points are ±1 × (1, 2 or 4 for none, double, redouble), applied to the bidding team only.
The match ends when a team reaches `+matchTarget` (it wins) or `−matchTarget` (it loses).
After a scored deal, the next player in the play direction deals. After an annulled deal the same dealer deals again.

## Uncertainties and choices made

* **Bangladesh reveal obligations and opponents' pair:** pagat's Bangladesh section does not mention them, so the standard rules are used.
* **Bangladesh pair benefit for 22+:** pagat lists 19/20 → 16 and 21 → 17. The engine continues the same −4 rule (22 → 18, …).
* **Dealer after an annulment:** not specified. The engine keeps the same dealer.
* **First-two no-point redeal:** applied automatically, without asking the player.
* **Doubling turn order:** the opponent after the bidder decides first, then the other opponent. After a double, the bidder decides on a redouble first, then the bidder's partner.

## Not implemented

Single hand, Joker/no-trump and reversed-rank variants, Lucknow "ditto"/"Tenny", the "set" after a redouble, auto-double for bids of 21+, the under-half penalty, the guess-first-trump variant, and the "each player bids once" variant.
They are not enabled because their exact behaviour is regionally inconsistent, or because implementing them correctly was out of scope.
