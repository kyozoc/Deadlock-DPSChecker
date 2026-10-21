import type { PropMap, PropValue, Scale, ScaledValue } from '../types/game-data.ts';

/** スケーリングの計算に使うステータス */
export interface ScaleContext {
  spiritPower: number;
  /** ブーン (パワー増加) の回数 */
  boons: number;
}

/**
 * プロパティの実際の値。基礎値 + Σ(係数 × ステータス)。
 * 'spirit' と 'power_increase' 以外のスケーリング (duration / cooldown / range など) は
 * 「その種類の補正が効く」という印なので足し算には使わない。
 */
export function evalProp(value: PropValue | undefined, ctx: ScaleContext): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  let total = value.value;
  for (const s of value.scale) {
    if (s.type === 'spirit') total += s.value * ctx.spiritPower;
    else if (s.type === 'power_increase') total += s.value * ctx.boons;
  }
  return total;
}

/** スキルポイントの強化 (T1〜tier) を順に適用したプロパティ */
export function applyUpgrades(props: PropMap, upgrades: PropMap[], tier: number): PropMap {
  const out: PropMap = { ...props };
  for (const upgrade of upgrades.slice(0, tier)) {
    for (const [key, up] of Object.entries(upgrade)) {
      out[key] = applyUpgrade(out[key], up);
    }
  }
  return out;
}

function applyUpgrade(base: PropValue | undefined, up: PropValue): PropValue {
  const b: ScaledValue = toScaled(base ?? 0);
  if (typeof up === 'number') return simplify({ ...b, value: b.value + up });

  const value = up.multiply ? b.value * up.value : b.value + up.value;
  let scale: Scale[] = b.scale.map((s) => ({ ...s }));
  for (const s of up.scale) {
    const existing = scale.find((x) => x.type === s.type);
    if (!existing) {
      if (!s.multiply) scale.push({ type: s.type, value: s.value });
    } else {
      existing.value = s.multiply ? existing.value * s.value : existing.value + s.value;
    }
  }
  // 基礎値への乗算は、係数側の乗算が別に無ければ係数にも掛ける
  if (up.multiply && !up.scale.some((s) => s.multiply)) {
    scale = scale.map((s) => ({ ...s, value: s.value * up.value }));
  }
  return simplify({ value, scale });
}

function toScaled(v: PropValue): ScaledValue {
  return typeof v === 'number' ? { value: v, scale: [] } : { value: v.value, scale: v.scale };
}

function simplify(v: ScaledValue): PropValue {
  return v.scale.length === 0 ? v.value : { value: v.value, scale: v.scale };
}
