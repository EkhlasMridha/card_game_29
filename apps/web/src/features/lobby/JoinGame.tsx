import { useState } from 'react';
import { NAME_MAX } from '@card29/shared';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n';
import { net } from '../../network/client';
import { useStore } from '../../state/hooks';
import { store } from '../../state/store';

export function JoinGame({ onBack }: { onBack: () => void }) {
  const savedName = useStore((s) => s.settings.name);
  const info = useStore((s) => s.serverInfo);
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');

  const join = (roomCode: string) => {
    const n = name.trim();
    if (!n) return store.toast('Please enter a display name.', 'warn');
    if (!/^[A-Z0-9]{4}$/.test(roomCode)) return store.toast('Room codes have 4 letters/numbers.', 'warn');
    store.updateSettings({ name: n });
    net.send({ type: 'JOIN_ROOM', code: roomCode, name: n });
  };

  const open = info?.rooms.filter((r) => !r.inGame && r.players < 4) ?? [];

  return (
    <Screen title={t('menuJoin')} onBack={onBack}>
      <form
        className="panel flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          join(code.trim().toUpperCase());
        }}
      >
        <div>
          <label className="label" htmlFor="jname">
            {t('yourName')}
          </label>
          <input
            id="jname"
            className="input"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label" htmlFor="jcode">
            {t('roomCode')}
          </label>
          <input
            id="jcode"
            className="input text-center font-mono text-2xl tracking-[0.5em] uppercase"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABCD"
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
        <button className="btn-primary" type="submit">
          {t('joinRoom')}
        </button>
      </form>

      {open.length > 0 && (
        <div className="panel mt-4 p-4">
          <h2 className="label">Open tables on this host</h2>
          <ul className="flex flex-col gap-2">
            {open.map((r) => (
              <li key={r.code}>
                <button
                  className="flex w-full items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                  onClick={() => join(r.code)}
                >
                  <span>
                    <span className="block font-semibold">{r.name}</span>
                    <span className="text-xs text-white/50">{r.players}/4 players</span>
                  </span>
                  <span className="font-mono text-lg tracking-widest text-gold-300">{r.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {info && info.discoveredHosts.length > 0 && (
        <div className="panel mt-4 p-4">
          <h2 className="label">Other 29 hosts found on this network</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {info.discoveredHosts.map((h) => (
              <li key={h.url}>
                <a className="text-gold-300 underline" href={h.url}>
                  {h.name} — {h.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/60">
        <p className="mb-2 font-semibold text-white/80">Address vs. room code</p>
        <p>
          You are connected to the host at <span className="font-mono text-gold-300">{location.host}</span>. To reach a{' '}
          <em>different</em> host, open its address in your browser (for example <span className="font-mono">http://192.168.1.100:5050</span>). A room
          code only picks a table <em>on the host you are connected to</em>. It cannot find a host for you.
        </p>
      </div>
    </Screen>
  );
}
