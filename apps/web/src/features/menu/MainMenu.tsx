import { ConnectionBadge } from '../../components/ConnectionBadge';
import { MiniCard } from '../../components/Cards';
import { t } from '../../i18n';
import { useStore } from '../../state/hooks';
import type { AppScreen } from '../../app/App';

const ITEMS: { screen: AppScreen | 'quick'; label: string; hint: string; primary?: boolean }[] = [
  { screen: 'quick', label: t('menuPlayLocally'), hint: t('menuPlayLocallyHint'), primary: true },
  { screen: 'create', label: t('menuCreate'), hint: t('menuCreateHint') },
  { screen: 'join', label: t('menuJoin'), hint: t('menuJoinHint') },
  { screen: 'tutorial', label: t('menuHowTo'), hint: t('menuHowToHint') },
  { screen: 'rules', label: t('menuRules'), hint: t('menuRulesHint') },
  { screen: 'privacy', label: t('menuPrivacy'), hint: t('menuPrivacyHint') },
];

export function MainMenu({ go, quickPlay }: { go: (s: AppScreen) => void; quickPlay: () => void }) {
  const leftReason = useStore((s) => s.leftReason);
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-10 lg:flex-row lg:gap-16">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <div className="relative mb-6 h-36 w-56" aria-hidden>
          <div className="absolute left-4 top-5 -rotate-12">
            <MiniCard card="JH" size={78} />
          </div>
          <div className="absolute left-[76px] top-0">
            <MiniCard card="9S" size={78} />
          </div>
          <div className="absolute left-[148px] top-5 rotate-12">
            <MiniCard card="AD" size={78} />
          </div>
        </div>
        <h1 className="font-display text-6xl font-bold tracking-tight text-gold-300 sm:text-7xl">
          Twenty<span className="text-white/90">-</span>Nine
        </h1>
        <p className="mt-3 max-w-sm text-base text-white/65">{t('appTagline')}</p>
        <div className="mt-4 flex items-center gap-3">
          <ConnectionBadge />
          <span className="chip">LAN only · no internet</span>
        </div>
      </div>

      <nav className="panel w-full max-w-md p-3" aria-label="Main menu">
        {leftReason && (
          <div className="mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{leftReason}</div>
        )}
        <ul className="flex flex-col gap-1.5">
          {ITEMS.map((item) => (
            <li key={item.label}>
              <button
                onClick={() => (item.screen === 'quick' ? quickPlay() : go(item.screen))}
                className={`group flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition ${
                  item.primary
                    ? 'bg-gradient-to-r from-gold-500/25 to-gold-500/5 ring-1 ring-gold-400/40 hover:from-gold-500/35'
                    : 'hover:bg-white/5'
                }`}
              >
                <span>
                  <span className={`block text-base font-semibold ${item.primary ? 'text-gold-300' : 'text-white'}`}>{item.label}</span>
                  <span className="block text-xs text-white/50">{item.hint}</span>
                </span>
                <span className="text-white/30 transition group-hover:translate-x-1 group-hover:text-gold-300">→</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
