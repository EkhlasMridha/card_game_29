import { NAME_MAX } from '@card29/shared';
import { MiniCard } from '../../components/Cards';
import { t } from '../../i18n';
import { useStore } from '../../state/hooks';
import { store } from '../../state/store';

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/5 py-3">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {hint && <span className="block text-xs text-white/50">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${value ? 'bg-gold-500' : 'bg-white/15'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  );
}

/** Per-device preferences, stored only in this browser's localStorage. */
export function SettingsPanel() {
  const s = useStore((st) => st.settings);
  return (
    <div>
      <div className="border-b border-white/5 pb-3">
        <label className="label" htmlFor="sname">
          {t('yourName')}
        </label>
        <input
          id="sname"
          className="input"
          maxLength={NAME_MAX}
          value={s.name}
          onChange={(e) => store.updateSettings({ name: e.target.value })}
          placeholder={t('namePlaceholder')}
        />
      </div>
      <Toggle label="Sound effects" hint="Synthesised in the browser; no audio files." value={s.sound} onChange={(v) => store.updateSettings({ sound: v })} />
      <Toggle
        label="Reduced motion"
        hint="Minimal animations (follows your system setting by default)."
        value={s.motion === 'reduced'}
        onChange={(v) => store.updateSettings({ motion: v ? 'reduced' : 'full' })}
      />
      <Toggle
        label="Four-colour suits"
        hint="Diamonds blue, clubs green — easier to tell apart."
        value={s.fourColor}
        onChange={(v) => store.updateSettings({ fourColor: v })}
      />
      <div className="mt-3 flex gap-2">
        {(['JH', '9D', 'AC', '10S'] as const).map((c) => (
          <MiniCard key={c} card={c} size={44} />
        ))}
      </div>
      <p className="mt-4 text-xs text-white/45">Language: English. The interface is structured for a Bangla translation.</p>
    </div>
  );
}
