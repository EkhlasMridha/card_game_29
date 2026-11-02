# Installation & hosting

Requirements: **Node.js 20.11+** (tested on 20.11.1) and npm 10. No Docker, database or account is needed.

```bash
npm install        # first time only — needs internet (or a warm npm cache)
npm run build      # builds apps/web/dist and apps/server/dist
npm start          # serves everything on port 5050
```

After `npm install`, everything runs offline. Startup prints the LAN addresses:

```
  Local:   http://localhost:5050
  LAN:     http://192.168.1.100:5050   (Wi-Fi)
```

Options: `npm start -- --port 5051`, `--bind 192.168.1.100` (listen on a single interface), `--discovery` (UDP LAN announcements on port 41029), `--name "Living room"`.

## Firewall

* **Windows:** when Windows Defender Firewall asks about Node.js, allow it on **Private networks**. Or add an inbound rule for TCP 5050 (and UDP 41029 if you use discovery).
* **macOS:** System Settings → Network → Firewall → allow incoming connections for `node`.
* **Linux (ufw):** `sudo ufw allow 5050/tcp`.

Never forward the port on your router. The game is meant for the local network only.

## Troubleshooting joining

* All devices must be on the same network. Guest Wi-Fi, "AP/client isolation" and some phone hotspots block device-to-device traffic.
* Use the LAN address (`192.168.x.x`, `10.x.x.x`), not `localhost`, on other devices.
* With several network adapters (VPN, virtual switches), pick the Wi-Fi address in the lobby's address selector.

## Development

```bash
npm run dev   # host server (tsx watch, port 5050, --dev) + Vite (port 5173, proxied /ws)
```

Open `http://localhost:5173`, or `http://<lan-ip>:5173` from other devices. Vite is for development only. Production play uses `npm start`.

`npm run typecheck` typechecks all three packages.

## Docker

Requires Docker with Compose v2. The image is a two-stage build: Node 22.23.4 (LTS) builds the minified bundles, and the runtime is bare Alpine with a symbol-stripped `node` binary (about 127 MB, with no npm and no `node_modules`). It runs as a non-root user on a read-only filesystem with all capabilities dropped.

```bash
# Use this computer's LAN IP so the lobby shows players a reachable join link and QR code.
ADVERTISE_ADDRESS=192.168.1.100 docker compose up -d --build
docker compose logs -f        # startup banner and errors
docker compose down           # stop
```

You can also put `ADVERTISE_ADDRESS=192.168.1.100` in a `.env` file next to `docker-compose.yml`. Without it, the lobby shows the container's internal `172.x` address, which other devices can't reach. Port 5050 on the host maps to 5050 in the container. LAN discovery (`--discovery`) doesn't work through Docker's bridge network.

Without Compose: `docker build -t twentynine-lan . && docker run -d -p 5050:5050 -e ADVERTISE_ADDRESS=192.168.1.100 --read-only --cap-drop ALL twentynine-lan`.
