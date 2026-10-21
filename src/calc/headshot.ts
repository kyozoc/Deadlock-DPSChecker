import type { Crit, HeroStats } from '../types/game-data.ts';

/** 武器の crit データが取れなかったときの標準値 (ほぼ全武器がこの値) */
const DEFAULT_WEAPON_BONUS = 0.65;

export interface HeadshotInput {
  weaponCrit: Crit | null;
  attacker: Pick<HeroStats, 'critBonusScale'>;
  target: Pick<HeroStats, 'critReceivedScale'>;
  /** アイテムやスキルによる加算 (+20% なら 0.2) */
  extraBonus?: number;
  /** 距離 (m)。武器の crit が距離で変わる場合だけ効く */
  distance?: number;
}

/**
 * ヘッドショット時のダメージ倍率。
 *
 *   倍率 = 1 + (武器のボーナス + (critBonusScale - 1) + extraBonus) × critReceivedScale
 *
 * Deadlock Wiki (Weapon Damage) の式 `1 + [(0.65 + Crit Bonus Scale) × Crit Resist]` に合わせている。
 * Wiki の Crit Bonus Scale はヒーロー補正の加算表記 (Drifter = -45%) なので critBonusScale - 1 にあたる。
 * 例: Haze → Haze 1.65 / Drifter → Haze 1.20 / Haze → Gigawatt 1.2925
 */
export function headshotMultiplier({
  weaponCrit,
  attacker,
  target,
  extraBonus = 0,
  distance = 0,
}: HeadshotInput): number {
  if (weaponCrit && !weaponCrit.canCrit) return 1;
  const weaponBonus = weaponCrit ? weaponBonusAt(weaponCrit, distance) : DEFAULT_WEAPON_BONUS;
  const bonus = weaponBonus + (attacker.critBonusScale - 1) + extraBonus;
  return 1 + Math.max(0, bonus) * target.critReceivedScale;
}

/**
 * 距離による補間。現状は全武器 bonusStart === bonusEnd なので結果は変わらない。
 * 線形補間はゲーム内で未検証の仮定。
 */
function weaponBonusAt(crit: Crit, distance: number): number {
  const { bonusStart, bonusEnd, startRange, endRange } = crit;
  if (bonusStart === bonusEnd || endRange <= startRange) return bonusStart - 1;
  const t = Math.min(1, Math.max(0, (distance - startRange) / (endRange - startRange)));
  return bonusStart + (bonusEnd - bonusStart) * t - 1;
}
