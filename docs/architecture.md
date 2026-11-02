# Architecture

```
packages/shared   cards, rules config (+zod), protocol schemas, view types, sanitiser
apps/server       authoritative host: HTTP static server + WebSocket + game engine
apps/web          React UI (menus, lobby, dialogs) + Phaser card table
```

Only the server holds game state. The client renders server snapshots and sends intents.

## Server (`apps/server/src`)

| Module | Responsibility |
|---|---|
| `game/deck.ts` | 32-card deck, Fisher–Yates with `crypto.randomInt` |
| `game/bidding.ts` | Priority and open auctions |
| `game/play.ts` | Legal cards, reveal rules, trick winner |
| `game/pair.ts` | King–Queen eligibility and target adjustment |
| `game/scoring.ts` | Card points, contract result, game points, match end |
| `game/match.ts` | State machine (deal → bid → trump → double → play → score) |
| `game/view.ts` | **Per-seat snapshots**, the only way state leaves the server |
| `rooms/room.ts` | Seats, host, lobby actions, reconnection, broadcast |
| `rooms/roomManager.ts` | Room codes, limits, idle cleanup |
| `websocket/connection.ts` | Size, rate and schema validation; routing; seat binding |
| `security/*` | Origin check, tokens, rate limiter |
| `network/*` | LAN interface listing, optional UDP discovery |
| `http/staticServer.ts` | Serves `apps/web/dist`, CSP and security headers, `/api/info` |

The rules engine imports nothing from the network, React or Phaser.

### State machine

| Phase | Valid actions | Exit |
|---|---|---|
| LOBBY | seat, kick, rules, start (host) | four connected players, host starts |
| BIDDING | `PLACE_BID`, `DITTO_BID`, `PASS_BID` (turn player) | winner → TRUMP_SELECTION; all pass → redeal / dealer forced |
| TRUMP_SELECTION | `SELECT_TRUMP` (bidder) | → DOUBLING or final deal |
| DOUBLING | `DOUBLE_DECISION` (asked player) | → final deal → PLAYING (or annulled) |
| PLAYING | `PLAY_CARD`, `REQUEST_TRUMP_REVEAL` (turn player), `DECLARE_PAIR` (eligible holder) | 8 tricks → DEAL_SUMMARY / MATCH_FINISHED |
| DEAL_SUMMARY | `CONTINUE` (each player) | all connected players ready → next deal |
| MATCH_FINISHED | `END_MATCH`, `CLOSE_ROOM` (host) | → LOBBY |

Every action is checked against the phase, turn and seat. Anything else gets
`ACTION_REJECTED`. There are no turn timeouts: the table waits for a disconnected
player, whose seat and hand are kept, and the "continue" step never waits on
disconnected players.

## Client (`apps/web/src`)

* `network/client.ts`: WebSocket (same origin), reconnect with backoff, resumes the seat using the token in localStorage.
* `state/store.ts`: external store mirroring the latest snapshot. React reads it with `useSyncExternalStore`.
* `game/events/bridge.ts`: the only interface between Phaser and the app (`snapshot`, `subscribe`, `onEvent`, `playCard`).
* `game/scenes/TableScene.ts`: each render reconciles sprites against the latest snapshot.
  Animations are cosmetic and never gate input. A reconnect or a dropped animation cannot desync the table.
* `game/phaser/GameCanvas.tsx`: creates one Phaser game per mount and destroys it on unmount.
  It renders at device-pixel resolution (≤2×) and resizes through a ResizeObserver.
* React owns menus, lobby, HUD, bidding/trump/double panels, summaries, rulebook and settings.

Card art is generated as SVG in `game/entities/cardArt.ts`, and sounds are synthesised with Web Audio. There are no runtime asset downloads.
