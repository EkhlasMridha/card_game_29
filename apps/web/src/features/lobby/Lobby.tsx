import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { TEAM_NAMES, describeRules, teamOf, type RoomView, type Seat } from '@card29/shared';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { Modal } from '../../components/Modal';
import { t } from '../../i18n';
import { net, roomLink } from '../../network/client';
import { store } from '../../state/store';
import { useStore } from '../../state/hooks';
import { RulesEditor } from './RulesEditor';

function useJoinUrls(): { url: string; label: string }[] {
  const info = useStore((s) => s.serverInfo);
  return useMemo(() => {
    // Behind a reverse proxy the public site address is the only one that works for everyone.
    if (info?.publicUrl) return [{ url: info.publicUrl, label: 'Public address' }];
    const port = location.port || (location.protocol === 'https:' ? '443' : '80');
    const list: { url: string; label: string }[] = [];
    const hostIsLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (!hostIsLoopback) list.push({ url: `${location.protocol}//${location.host}`, label: 'This address' });
    for (const a of info?.addresses ?? []) {
      // In development the page is served by Vite on another port; share the page's port.
      const url = `http://${a.address}:${port}`;
      if (!list.some((l) => l.url === url)) list.push({ url, label: a.interface });
    }
    return list;
  }, [info]);
}

function QrImage({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Generated locally by the bundled "qrcode" library — no external service.
    QRCode.toDataURL(text, { margin: 1, width: 220, color: { dark: '#08130f', light: '#f6f0e1' } })
      .then((d) => alive && setSrc(d))
      .catch(() => setSrc(null));
    return () => {
      alive = false;
    };
  }, [text]);
  return src ? <img src={src} alt={`QR code for ${text}`} width={150} height={150} className="rounded-lg" /> : null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    // The Clipboard API needs a secure context (https or localhost).
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Plain-http LAN addresses: the legacy copy command still works there.
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      className="btn-secondary min-h-9 shrink-0 px-3 py-1 text-xs"
      onClick={async () => {
        if (await copyText(text)) setCopied(true);
        else store.toast('Could not copy. Select the text and copy it manually.', 'warn');
      }}
      aria-label={label}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

const SEAT_POS: Record<number, string> = {
  0: 'col-start-2 row-start-3',
  1: 'col-start-1 row-start-2',
  2: 'col-start-2 row-start-1',
  3: 'col-start-3 row-start-2',
};

export function Lobby({ room }: { room: RoomView }) {
  const urls = useJoinUrls();
  const online = useStore((s) => !!s.serverInfo?.publicUrl);
  const [urlIdx, setUrlIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const base = urls[Math.min(urlIdx, urls.length - 1)]?.url ?? null;
  const url = base ? roomLink(base, room.code) : null;
  const filled = room.seats.filter((s) => s.occupied).length;
  const allConnected = room.seats.every((s) => s.occupied && s.connected);
  const seatedConnected = room.seats.every((s) => !s.occupied || s.connected);
  const ruleLines = describeRules(room.rules);

  // Orient the diagram so that the viewer sits at the bottom.
  const me = room.yourSeat ?? 0;
  const relPos = (seat: Seat) => SEAT_POS[(seat - me + 4) % 4];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label mb-0">{t('lobbyTitle')}</p>
          <h1 className="font-display text-4xl font-semibold text-gold-300">{room.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <button className="btn-secondary" onClick={() => net.send({ type: 'LEAVE_ROOM' })}>
            {t('leaveRoom')}
          </button>
          {room.youAreHost && (
            <button className="btn-danger" onClick={() => net.send({ type: 'CLOSE_ROOM' })}>
              {t('closeRoom')}
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <section className="panel p-5" aria-label="Seats">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl text-white">Table</h2>
            <span className="chip">{filled}/4 seated</span>
          </div>
          <div className="relative grid grid-cols-3 grid-rows-3 gap-2 sm:gap-3">
            <div className="col-start-2 row-start-2 flex items-center justify-center rounded-2xl bg-gradient-to-br from-felt-500/60 to-felt-700/80 p-3 text-center ring-1 ring-gold-500/30">
              <div>
                <div className="font-display text-3xl font-bold text-gold-300">29</div>
                <div className="text-[10px] tracking-widest text-white/60 uppercase">Partners sit opposite</div>
              </div>
            </div>
            {room.seats.map((s) => {
              const team = teamOf(s.seat);
              return (
                <div
                  key={s.seat}
                  className={`${relPos(s.seat)} flex min-h-24 flex-col justify-between rounded-2xl border p-3 ${
                    s.isYou ? 'border-gold-400/70 bg-gold-500/10' : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase">
                    <span className={`h-2 w-2 rounded-full ${team === 0 ? 'bg-team-a' : 'bg-team-b'}`} />
                    <span className={team === 0 ? 'text-team-a' : 'text-team-b'}>{TEAM_NAMES[team]}</span>
                  </div>
                  {s.occupied ? (
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{s.name}</div>
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-white/60">
                        {s.isYou && <span>{t('you')}</span>}
                        {s.isBot && <span className="rounded bg-white/10 px-1 text-sky-200">BOT</span>}
                        {s.isHost && <span className="text-gold-300">★ {t('host')}</span>}
                        {!s.connected && <span className="text-amber-300">{t('offline')}</span>}
                      </div>
                      {room.youAreHost && !s.isYou && (
                        <button className="mt-1 text-[10px] text-rose-300 underline" onClick={() => net.send({ type: 'KICK_PLAYER', seat: s.seat })}>
                          {t('remove')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-col gap-1">
                      <button
                        className="rounded-lg border border-dashed border-white/20 py-1.5 text-xs text-white/60 hover:border-gold-400 hover:text-gold-300"
                        onClick={() => net.send({ type: 'SELECT_SEAT', seat: s.seat })}
                      >
                        {t('takeSeat')}
                      </button>
                      {room.youAreHost && (
                        <button
                          className="rounded-lg border border-dashed border-sky-300/25 py-1.5 text-xs text-sky-200/70 hover:border-sky-300 hover:text-sky-200"
                          onClick={() => net.send({ type: 'ADD_BOT', seat: s.seat })}
                        >
                          + Add bot
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            {room.youAreHost ? (
              <div className="flex flex-col gap-2">
                <button
                  className="btn-primary w-full text-base"
                  disabled={filled < 4 || !allConnected}
                  onClick={() => net.send({ type: 'START_GAME' })}
                >
                  {filled < 4 ? t('lobbyNeedFour', { n: filled }) : !allConnected ? 'Waiting for everyone to reconnect' : t('startMatch')}
                </button>
                {filled < 4 && (
                  <button
                    className="btn-secondary w-full"
                    disabled={!seatedConnected}
                    onClick={() => net.send({ type: 'START_GAME', fillBots: true })}
                  >
                    Start now with {4 - filled} bot{4 - filled === 1 ? '' : 's'} in the empty seat{4 - filled === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-white/70">{t('lobbyWaiting')}</p>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="panel p-5" aria-label="How to join">
            <h2 className="mb-3 font-display text-2xl text-white">Invite players</h2>
            <div className="flex flex-col gap-4 sm:flex-row">
              {url && (
                <div className="shrink-0 self-center">
                  <QrImage text={url} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="label">{t('roomCode')}</p>
                <div className="mb-3 flex items-center gap-3">
                  <p className="font-mono text-4xl font-bold tracking-[0.3em] text-gold-300">{room.code}</p>
                  <CopyButton text={room.code} label="Copy code" />
                </div>
                <p className="label">{t('joinAddress')}</p>
                {url ? (
                  <div className="flex items-start gap-2">
                    <a className="min-w-0 flex-1 font-mono text-sm break-all text-white underline decoration-white/30 hover:text-gold-300" href={url}>
                      {url}
                    </a>
                    <CopyButton text={url} label="Copy link" />
                  </div>
                ) : (
                  <p className="text-sm text-amber-200">No LAN address found. Connect the host computer to Wi-Fi.</p>
                )}
                {urls.length > 1 && (
                  <select
                    className="input mt-2 min-h-9 py-1 text-sm"
                    value={urlIdx}
                    onChange={(e) => setUrlIdx(Number(e.target.value))}
                    aria-label="Network interface"
                  >
                    {urls.map((u, i) => (
                      <option key={u.url} value={i}>
                        {u.url} ({u.label})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-white/60">
              {!online && (
                <li>Join the same Wi-Fi network as the host (guest networks and some hotspots block devices from seeing each other).</li>
              )}
              <li>Send the join link (or show the QR code). It opens this room directly.</li>
              <li>
                Or open {online ? 'this site' : 'the address'}, choose Join Game and enter room code{' '}
                <span className="font-mono text-gold-300">{room.code}</span>.
              </li>
            </ol>
          </section>

          <section className="panel p-5" aria-label="Rules">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-2xl text-white">{t('rulesInPlay')}</h2>
              {room.youAreHost && (
                <button className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => setEditing(true)}>
                  {t('editRules')}
                </button>
              )}
            </div>
            <ul className="space-y-1 text-sm text-white/75">
              {ruleLines.map((l, i) => (
                <li key={l} className={i === 0 ? 'font-semibold text-gold-300' : ''}>
                  {i === 0 ? l : `• ${l}`}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {editing && (
        <Modal title="House rules" onClose={() => setEditing(false)} wide>
          <RulesEditor rules={room.rules} onChange={(rules) => net.send({ type: 'UPDATE_RULES', rules })} />
        </Modal>
      )}
    </div>
  );
}
