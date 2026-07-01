import type { DrawdownValue } from '@/lib/vitals/drawdown';
import { formatMoneyCompact, type DisplayCurrency } from '@/lib/money';

interface Props {
  data: DrawdownValue;
  displayCurrency: DisplayCurrency;
}

export function DrawdownBars({ data, displayCurrency }: Props) {
  // Shock values are EUR-normalized positive magnitudes shown as losses —
  // convert to the display currency and negate for the U+2212 sign.
  const fmt = (eur: number) => formatMoneyCompact(-Math.abs(eur), 'EUR', displayCurrency);
  const { equitiesShockEur, cryptoShockEur, housingShockEur, combinedShockEur } = data;

  // Normalize bar widths relative to combined shock (= 100%)
  const max = Math.max(combinedShockEur, 1);
  const pct = (v: number) => `${Math.min(100, Math.round((v / max) * 100))}%`;

  const rows = [
    { label: 'Equities −30%',   value: equitiesShockEur,  isCombined: false },
    { label: 'Crypto −50%',     value: cryptoShockEur,    isCombined: false },
    { label: 'Housing −15%',    value: housingShockEur,   isCombined: false },
  ];

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  };

  const labelStyle = (combined: boolean): React.CSSProperties => ({
    flex: '0 0 108px',
    fontSize: 'var(--fs-caption)',
    color: combined ? 'var(--text)' : 'var(--text-dim)',
    fontWeight: combined ? 600 : 400,
  });

  const trackStyle: React.CSSProperties = {
    flex: 1,
    height: 13,
    background: 'var(--surface-deep)',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  };

  const valueStyle = (combined: boolean): React.CSSProperties => ({
    flex: '0 0 50px',
    textAlign: 'right',
    fontSize: combined ? 'var(--fs-meta)' : 'var(--fs-caption)',
    color: 'var(--negative-text)',
    fontWeight: combined ? 600 : 500,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '6px 0 4px' }}>
      {rows.map((r) => (
        <div key={r.label} style={rowStyle}>
          <span style={labelStyle(false)}>{r.label}</span>
          <span style={trackStyle}>
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: pct(r.value),
                background: 'var(--negative)',
                opacity: 0.55,
              }}
            />
          </span>
          <span className="tnum" style={valueStyle(false)}>{fmt(r.value)}</span>
        </div>
      ))}

      {/* Combined row — separated by dashed top border */}
      <div
        style={{
          ...rowStyle,
          paddingTop: 'var(--space-2)',
          marginTop: 'var(--space-1)',
          borderTop: '0.5px dashed var(--border)',
        }}
      >
        <span style={labelStyle(true)}>Combined shock</span>
        <span style={trackStyle}>
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: '100%',
              background: 'var(--negative)',
              opacity: 0.88,
            }}
          />
        </span>
        <span className="tnum" style={valueStyle(true)}>{fmt(combinedShockEur)}</span>
      </div>
    </div>
  );
}
