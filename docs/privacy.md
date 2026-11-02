# Privacy & threat model

## Guarantees

* **No internet traffic.** The app consists of local HTTP and WebSocket traffic to the host, plus optional UDP broadcast (`--discovery`, off by default).
  There are no CDNs, fonts, analytics, telemetry, crash reporting, ads, cloud auth, STUN/TURN or remote logging.
* **Enforced in the browser** by a Content-Security-Policy of `default-src 'self'` with `connect-src` limited to this host.
  Even a bug could not make the page load or send to another origin.
* Fonts (`@fontsource`), Phaser, React and the QR generator are bundled at build time.
  Card art is SVG generated in code, and sounds are synthesised with Web Audio.
* **Data minimisation:** display names only, no registration. State is kept in memory and nothing is written to disk.
  Rooms are deleted when closed or after 30 minutes with nobody connected. No game history is stored.
  The server logs only startup information and internal errors (never hands or trump).
* The browser stores only preferences (`t29.settings`) and the seat token (`t29.session`, cleared on leave).

## Threat model (same Wi-Fi)

| Threat | Mitigation |
|---|---|
| A player's client reads hidden cards or trump | Never sent. Snapshots are built per seat on the server (`view.ts`). Verified by the bot audit described in the README. |
| A modified client plays for another seat or makes illegal moves | Actions are bound to the connection's seat, and phase, turn, bid range and card legality are validated on the server |
| Predictable shuffle | `crypto.randomInt` Fisher–Yates |
| Seat hijacking | 128-bit random session tokens, compared in constant time |
| A malicious web page in a player's browser connecting to the host (cross-site WebSocket) | The `Origin` header must equal the `Host`. Other origins get 403 at upgrade. |
| Flooding / oversized messages | 8 KiB max payload, per-connection token bucket, room limit (16), schema validation |
| Name injection / spoofing | Names are sanitised (control and bidi-override characters removed, length-limited) and rendered as text |
| Network eavesdropping | **Not mitigated.** Traffic is plain HTTP/WS on the LAN, so someone sniffing the Wi-Fi could read your own hand traffic. Play on a trusted network. |
| Compromised host machine | **Not mitigated.** The host process holds the full state. |

Room codes are a convenience for picking a table on a host. They are not secrets, and anyone connected to the host can see the list of open rooms.
