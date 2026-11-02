import type { ReactNode } from 'react';
import { t } from '../i18n';

export function Screen({ title, onBack, children, wide = false }: { title: string; onBack?: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="mx-auto flex min-h-full w-full flex-col px-4 py-6 sm:py-10" style={{ maxWidth: wide ? 960 : 560 }}>
      <div className="mb-5 flex items-center gap-3">
        {onBack && (
          <button className="btn-secondary min-h-10 px-3" onClick={onBack}>
            ← {t('back')}
          </button>
        )}
        <h1 className="font-display text-3xl font-semibold text-gold-300 sm:text-4xl">{title}</h1>
      </div>
      <div className="animate-rise">{children}</div>
    </div>
  );
}
