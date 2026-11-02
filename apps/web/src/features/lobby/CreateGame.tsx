import { useState } from 'react';
import { BANGLADESH_RULES, NAME_MAX, ROOM_NAME_MAX, type RulesConfig } from '@twentynine/shared';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n';
import { net } from '../../network/client';
import { useStore } from '../../state/hooks';
import { store } from '../../state/store';
import { RulesEditor } from './RulesEditor';

export function CreateGame({ onBack }: { onBack: () => void }) {
  const savedName = useStore((s) => s.settings.name);
  const [name, setName] = useState(savedName);
  const [roomName, setRoomName] = useState('');
  const [rules, setRules] = useState<RulesConfig>(BANGLADESH_RULES);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return store.toast('Please enter a display name.', 'warn');
    store.updateSettings({ name: n });
    net.send({ type: 'CREATE_ROOM', name: n, roomName: roomName.trim() || undefined, rules });
  };

  return (
    <Screen title={t('menuCreate')} onBack={onBack} wide>
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="panel flex flex-col gap-4 self-start p-5 lg:sticky lg:top-6">
          <div>
            <label className="label" htmlFor="cname">
              {t('yourName')}
            </label>
            <input
              id="cname"
              className="input"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="rname">
              {t('roomName')}
            </label>
            <input
              id="rname"
              className="input"
              maxLength={ROOM_NAME_MAX}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Friday night table"
              autoComplete="off"
            />
          </div>
          <p className="text-xs leading-relaxed text-white/55">
            The computer running the 29 server hosts this room. You get a room code and a local address to share. Other players open that address on the same Wi-Fi network.
          </p>
          <button className="btn-primary" type="submit">
            {t('createRoom')}
          </button>
        </div>
        <div className="panel p-5">
          <h2 className="mb-2 font-display text-2xl text-gold-300">Rules</h2>
          <RulesEditor rules={rules} onChange={setRules} />
        </div>
      </form>
    </Screen>
  );
}
