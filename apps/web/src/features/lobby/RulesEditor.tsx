import { BANGLADESH_RULES, STANDARD_RULES, type RulesConfig } from '@twentynine/shared';
import type { ReactNode } from 'react';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        {hint && <div className="text-xs text-white/50">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-ink-950/60 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
            value === o.value ? 'bg-gold-500 text-ink-950' : 'text-white/70 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 rounded-full transition ${value ? 'bg-gold-500' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export function RulesEditor({ rules, onChange }: { rules: RulesConfig; onChange: (r: RulesConfig) => void }) {
  const set = (patch: Partial<RulesConfig>) => onChange({ ...rules, ...patch, preset: 'custom' });
  const setPair = (patch: Partial<RulesConfig['pair']>) => set({ pair: { ...rules.pair, ...patch } });

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[
          { r: BANGLADESH_RULES, title: 'Bangladesh', sub: 'Default · min 16 · counter-clockwise' },
          { r: STANDARD_RULES, title: 'Standard', sub: 'pagat.com · min 15 · clockwise' },
        ].map(({ r, title, sub }) => (
          <button
            key={r.preset}
            type="button"
            onClick={() => onChange(r)}
            className={`rounded-xl border p-3 text-left transition ${
              rules.preset === r.preset ? 'border-gold-400 bg-gold-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="font-display text-lg font-semibold text-gold-300">{title}</div>
            <div className="text-xs text-white/55">{sub}</div>
          </button>
        ))}
      </div>
      {rules.preset === 'custom' && <p className="mb-2 text-xs text-amber-200/80">Custom house rules — based on your changes below.</p>}

      <Row label="Direction of play">
        <Segmented
          value={rules.direction}
          options={[
            { value: 'counterclockwise', label: 'Counter-clockwise' },
            { value: 'clockwise', label: 'Clockwise' },
          ]}
          onChange={(v) => set({ direction: v })}
        />
      </Row>
      <Row label="Minimum bid">
        <Segmented value={rules.minBid} options={[{ value: 15, label: '15' }, { value: 16, label: '16' }]} onChange={(v) => set({ minBid: v })} />
      </Row>
      <Row label="Auction style" hint="Priority: earlier speaker may hold with “ditto”. Open: bid higher or pass.">
        <Segmented
          value={rules.biddingStyle}
          options={[
            { value: 'priority', label: 'Priority' },
            { value: 'open', label: 'Open' },
          ]}
          onChange={(v) => set({ biddingStyle: v })}
        />
      </Row>
      <Row label="If the first three pass">
        <Segmented
          value={rules.allPass}
          options={[
            { value: 'redeal', label: 'Redeal' },
            { value: 'dealerForced', label: `Dealer bids ${rules.minBid}` },
          ]}
          onChange={(v) => set({ allPass: v })}
        />
      </Row>
      <Row label="Seventh-card trump" hint="Bidder may let their 7th card decide trump.">
        <Toggle value={rules.seventhCard} onChange={(v) => set({ seventhCard: v })} />
      </Row>
      <Row label="Asking for trump" hint="Mandatory: first player void must ask. Voluntary: may discard; asker must trump.">
        <Segmented
          value={rules.revealMode}
          options={[
            { value: 'mandatory', label: 'Mandatory' },
            { value: 'voluntary', label: 'Voluntary' },
          ]}
          onChange={(v) => set({ revealMode: v })}
        />
      </Row>
      <Row label="King–Queen pair">
        <Toggle value={rules.pair.enabled} onChange={(v) => setPair({ enabled: v })} />
      </Row>
      {rules.pair.enabled && (
        <>
          <Row label="Pair may be declared" hint="After reveal trick (Bangladesh) or right after own side wins a trick.">
            <Segmented
              value={rules.pair.timing}
              options={[
                { value: 'afterRevealTrick', label: 'After reveal trick' },
                { value: 'afterOwnTrickWin', label: 'After winning a trick' },
              ]}
              onChange={(v) => setPair({ timing: v })}
            />
          </Row>
          <Row label="Bidders’ pair helps only from bid" hint="Bangladesh: 19 (bids 16–18 gain nothing).">
            <Segmented
              value={rules.pair.bidderMinBid}
              options={[
                { value: 0, label: 'Any' },
                { value: 19, label: '19+' },
              ]}
              onChange={(v) => setPair({ bidderMinBid: v })}
            />
          </Row>
          <Row label="Lowest target after pair">
            <Segmented
              value={rules.pair.minTarget}
              options={[
                { value: 15, label: '15' },
                { value: 16, label: '16' },
              ]}
              onChange={(v) => setPair({ minTarget: v })}
            />
          </Row>
        </>
      )}
      <Row label="Last trick worth 1 point" hint="Total becomes 29, maximum bid 29.">
        <Toggle value={rules.lastTrickBonus} onChange={(v) => set({ lastTrickBonus: v })} />
      </Row>
      <Row label="Doubling">
        <Segmented
          value={rules.doubling}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'double', label: 'Double' },
            { value: 'redouble', label: '+ Redouble' },
          ]}
          onChange={(v) => set({ doubling: v })}
        />
      </Row>
      <Row label="Redeal: first two players without points" hint="Bangladesh annulment rule.">
        <Toggle value={rules.redealFirstTwoNoPoints} onChange={(v) => set({ redealFirstTwoNoPoints: v })} />
      </Row>
      <Row label="Annul weak seventh-card deals" hint="Bangladesh: caller lacks a point trump, or opponents hold none / only the 7.">
        <Toggle value={rules.redealSeventhCardWeak} onChange={(v) => set({ redealSeventhCardWeak: v })} />
      </Row>
      <Row label="Match length (game points)">
        <Segmented
          value={rules.matchTarget}
          options={[4, 6, 8, 10, 12].map((n) => ({ value: n as RulesConfig['matchTarget'], label: `±${n}` }))}
          onChange={(v) => set({ matchTarget: v })}
        />
      </Row>
    </div>
  );
}
