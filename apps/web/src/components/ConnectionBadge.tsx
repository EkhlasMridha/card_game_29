import { useStore } from '../state/hooks';
import { t } from '../i18n';

export function ConnectionBadge({ compact = false }: { compact?: boolean }) {
  const c = useStore((s) => s.connection);
  const color = c === 'open' ? 'bg-team-a' : c === 'closed' ? 'bg-rose-500' : 'bg-amber-400 animate-pulse';
  const label = c === 'open' ? t('connected') : c === 'connecting' ? t('connecting') : t('reconnecting');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/70" title={label} role="status">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {!compact && label}
    </span>
  );
}
