# WebSocket protocol (v1)

Endpoint: `ws://<host>:<port>/ws`. It is the same origin as the page, and other origins are refused at upgrade.
Messages are JSON text frames of at most 8 KiB. Each connection is limited to about 12 messages per second, with bursts up to 30.

Every client message carries `v: 1` and an optional numeric `id` (echoed in rejections). Each one is validated with zod (`packages/shared/src/protocol/messages.ts`).

## Client → server

| Type | Fields | Who / when |
|---|---|---|
| `HELLO` | — | any time; returns `SERVER_INFO` |
| `CREATE_ROOM` | `name`, `roomName?`, `rules` | creates a room and seats the creator as host |
| `JOIN_ROOM` | `code`, `name` | takes the first free seat (rejected if full or started) |
| `RESUME` | `code`, `token` | reclaims a previous seat |
| `LEAVE_ROOM` | — | lobby: frees the seat; in a match the seat is kept for rejoin |
| `SELECT_SEAT` | `seat` | lobby, empty seat |
| `KICK_PLAYER` | `seat` | host, lobby |
| `UPDATE_RULES` | `rules` | host, lobby |
| `START_GAME` | — | host, 4 connected players |
| `PLACE_BID` | `amount` | bidding turn |
| `DITTO_BID` | — | priority auction, holder's turn |
| `PASS_BID` | — | bidding turn |
| `SELECT_TRUMP` | `choice`: `H D C S SEVENTH` | bidder |
| `DOUBLE_DECISION` | `double` | asked player in the doubling phase |
| `REQUEST_TRUMP_REVEAL` | — | turn player who is void in the led suit, trump hidden |
| `PLAY_CARD` | `card` (e.g. `"10H"`) | turn player, legal card |
| `DECLARE_PAIR` | — | eligible K+Q holder |
| `CONTINUE` | — | deal summary |
| `END_MATCH` / `CLOSE_ROOM` | — | host |
| `REQUEST_STATE_SYNC` | — | re-sends your snapshot |
| `PING` | — | keep-alive |

## Server → client

| Type | Content |
|---|---|
| `SERVER_INFO` | version, port, LAN addresses, open rooms, discovered hosts |
| `ROOM_JOINED` | `code`, session `token`, `rejoined` |
| `STATE` | `rev`, `room` (RoomView), `game` (GameView for *this* seat, or null) |
| `EVENT` | `rev`, `event`: DEALT, REDEAL, BID, CONTRACT, TRUMP_SELECTED, DOUBLED, CARD_PLAYED, TRUMP_REVEALED, TRICK_COMPLETED, PAIR_DECLARED, DEAL_SCORED, MATCH_COMPLETED, NOTICE |
| `ACTION_REJECTED` | `action`, `reason` |
| `ERROR` | `code` (BAD_MESSAGE, PROTOCOL_MISMATCH, RATE_LIMITED, ROOM_NOT_FOUND, ROOM_FULL, SESSION_INVALID, NOT_IN_ROOM, TOO_MANY_ROOMS), `message` |
| `LEFT_ROOM` | `reason` |
| `PONG` | — |

`rev` increases monotonically per room. Clients drop any `STATE`/`EVENT` older than the newest one they have applied.
Events are only hints for animations and notifications. The `STATE` snapshot is authoritative.

## Information filtering

`GameView` is built per seat in `apps/server/src/game/view.ts`:

* `yourHand`: only your cards. Others appear only as `handCounts`.
* `trump.suit`: present only if revealed, if you are the bidder, or once the deal is over.
* `trump.seventhCard`: only for the bidder, before revelation.
* `actions`: computed for you only (legal cards, can reveal, can declare pair, …).
* `TRUMP_SELECTED` events never include the suit.
