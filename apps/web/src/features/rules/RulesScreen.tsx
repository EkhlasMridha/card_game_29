import { useState } from 'react';
import { BANGLADESH_RULES, STANDARD_RULES } from '@card29/shared';
import { Screen } from '../../components/Screen';
import { SettingsPanel } from '../settings/SettingsPanel';
import { Rulebook } from './Rulebook';

export function RulesScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'bangladesh' | 'standard' | 'settings'>('bangladesh');
  return (
    <Screen title="Rules & Settings" onBack={onBack} wide>
      <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-ink-950/60 p-1" role="tablist">
        {(
          [
            ['bangladesh', 'Bangladesh rules'],
            ['standard', 'Standard rules'],
            ['settings', 'Settings'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${tab === k ? 'bg-gold-500 text-ink-950' : 'text-white/70'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel p-5">
        {tab === 'settings' ? <SettingsPanel /> : <Rulebook rules={tab === 'bangladesh' ? BANGLADESH_RULES : STANDARD_RULES} />}
      </div>
    </Screen>
  );
}
