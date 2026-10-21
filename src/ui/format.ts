import type { LocalizedText, PropValue } from '../types/game-data.ts';

export function t(text: LocalizedText | undefined): string {
  return text ? (text.ja ?? text.en) : '';
}

export function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function signed(n: number, digits = 1): string {
  return `${n > 0 ? '+' : ''}${fmt(n, digits)}`;
}

/** プロパティの単位 (名前からの推定) */
export function unitOf(key: string): string {
  if (/Percent|Pct|Resist(?!.*Duration)|Reduction|FireRate|Multiplier$/.test(key) && !/Duration/.test(key)) return '%';
  if (/Duration|Cooldown|Time|Delay|Interval|TickRate/.test(key)) return '秒';
  if (/Range|Radius|Distance/.test(key)) return 'm';
  return '';
}

const SCALE_LABEL: Record<string, string> = {
  spirit: 'スピリット',
  power_increase: 'ブーン',
};

/** 「65 + スピリット×2.2」のような表示 */
export function formatProp(key: string, value: PropValue | undefined): string {
  if (value === undefined) return '';
  const unit = unitOf(key);
  if (typeof value === 'number') return `${signedIfDelta(key, value)}${unit}`;
  const scales = value.scale
    .filter((s) => SCALE_LABEL[s.type])
    .map((s) => ` + ${SCALE_LABEL[s.type]}×${fmt(s.value, 3)}`)
    .join('');
  return `${signedIfDelta(key, value.value)}${unit}${scales}`;
}

function signedIfDelta(key: string, v: number): string {
  return /Bonus|Reduction|Resist|Percent/.test(key) ? signed(v, 2) : fmt(v, 2);
}
