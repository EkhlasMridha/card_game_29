# Card 29 — the 29 card game for LAN or online play

A four-player implementation of the South Asian trick-taking game **29**, defaulting to the
**Bangladesh** rules. One server hosts the tables: run it on a computer for friends on the same Wi-Fi,
or put it online behind nginx. There are no accounts, no ads and no tracking.

* **Frontend:** React 19 + TypeScript + Vite 6, Tailwind CSS 4 for menus and dialogs, Phaser 3 for the card table
* **Backend:** Node.js + TypeScript, `ws`, an authoritative in-memory game engine
* **Shared:** zod schemas, a versioned protocol, the rules configuration

## Quick start

```bash
npm install      # first time only (downloads packages)
npm run build
npm start        # → http://localhost:5050 and http://<your-LAN-IP>:5050
```

Or with Docker: `ADVERTISE_ADDRESS=<your-LAN-IP> docker compose up -d --build` (see [docs/installation.md](docs/installation.md#docker)). To put Card 29 online behind nginx, see [docs/installation.md](docs/installation.md#behind-an-nginx-reverse-proxy).

1. On the host computer, open `http://localhost:5050` and choose **Play Locally** or **Create Game**.
2. The lobby shows the **room code**, the **LAN join address** and a QR code. If you have several network adapters, pick the Wi-Fi address.
3. The other three players open that address on the same Wi-Fi, choose **Join Game** and enter the code (or tap the open table).
4. When all four seats are filled, the host presses **Start match**.

A room code only selects a table *on the host you are connected to*. To reach the host, you need its LAN IP address and port.

Details: [docs/installation.md](docs/installation.md), covering the firewall (allow TCP 5050 on private networks), ports, dev mode and troubleshooting.

## Playing

* **Bidding:** tap a number to bid. In the Bangladesh priority auction, the earlier speaker can press **Hold** to equal a challenger's bid.
* **Trump:** the winner picks a suit in secret, or the *seventh card*. Opponents may double, and bidders may then redouble.
* **Play:** legal cards are raised and bright. Tap once to select, tap again to play.
  If you cannot follow suit while trump is hidden, press **Ask for trump** (the bidder sees **Reveal trump**).
* **Pair:** a **Declare pair** button appears when you are allowed to declare the King and Queen of trumps.
* **Deal summary:** each player presses **Next deal**. The match ends at ±6 game points (configurable).

The full rules, with sources, the variant matrix and every documented uncertainty, are in
[docs/rules.md](docs/rules.md). They are also available in-app (Rules & Settings, or the in-game menu),
along with a guided tutorial (**How to Play**).

### Configurable house rules
Direction · minimum bid 15/16 · priority or open auction · all-pass redeal or forced dealer ·
seventh card · mandatory or voluntary trump calling · pair timing, minimum and bid threshold ·
last-trick point · double/redouble · Bangladesh annulments · match length.

## Privacy

Only local HTTP, WebSocket and (optionally, with `--discovery`) UDP broadcast traffic. All assets are bundled, and a
strict Content-Security-Policy blocks every other origin. Hands and hidden trump never leave the server
for players who may not see them. Game state is in memory only. See [docs/privacy.md](docs/privacy.md) for the threat model.

## Project layout

```
apps/server     host: HTTP + WebSocket + rules engine (game/, rooms/, websocket/, security/, network/, http/)
apps/web        React app + Phaser table (features/, game/, network/, state/, i18n/, audio/)
packages/shared cards, rules config, protocol, view types
docs/           rules, architecture, protocol, privacy, installation
scripts/        dev runner, bot audit
```

[docs/architecture.md](docs/architecture.md) · [docs/network-protocol.md](docs/network-protocol.md)

## Pinned versions

| Package | Version |
|---|---|
| react / react-dom | 19.2.9 |
| phaser | 3.90.0 |
| vite | 6.4.4 (Vite 7+ needs Node ≥ 20.19; this project supports Node 20.11) |
| @vitejs/plugin-react | 4.7.0 |
| tailwindcss / @tailwindcss/vite | 4.1.18 |
| typescript | 5.9.3 |
| zod | 4.3.6 |
| ws | 8.18.3 |
| esbuild | 0.25.12 |
| tsx | 4.20.6 |
| qrcode | 1.5.4 |
| @fontsource-variable/inter, @fontsource/cormorant-garamond | 5.3.0 |

## Verification performed

* **Engine simulation:** 300 complete random matches across three rulesets, run directly against the engine.
  They checked follow-suit enforcement, rejection of every illegal card, card points totalling 28/29, and hidden-trump/seventh-card visibility in every snapshot.
  There were 0 violations.
* **End-to-end over WebSockets** (`node scripts/bot-audit.mjs 3` against `npm start`): four bot clients played 3 full matches (31 deals, about 11,800 messages).
  Every snapshot was scanned for cards a seat should not see and for a hidden trump suit, with **0 leaks**.
  All 59 deliberate illegal plays were rejected, a fifth player got `ROOM_FULL`, and a mid-game disconnect + `RESUME` restored the seat and hand.
* **Browser (desktop Chrome)** with three bot seats: lobby, QR code, priority bidding with hold, trump choice, legal-card highlighting, trump-reveal banner, trick collection, deal summary, next deal with dealer rotation, and refresh → automatic seat resume.
  The portrait phone layout was checked by constraining the canvas to 390×740.
* The production bundle contains no external fetch URLs (only license comments and XML namespaces).

**Not verified** (no hardware available during development): play on real phones and tablets across several devices
over a physical Wi-Fi network, Safari/iOS behaviour, the UDP discovery between two hosts, and running with the
network adapter fully disconnected.

## Known limitations

* The host's state is in memory. If the host process stops, the match is lost. There is no host migration.
* There are no turn timers. The table waits for a disconnected player, who can rejoin from the same browser.
* Traffic on the LAN is unencrypted HTTP/WS.
* Single hand, Joker/no-trump contracts and other regional variants are not implemented (see docs/rules.md).
* English only. UI strings are keyed (`apps/web/src/i18n`) so a Bangla dictionary can be added.
