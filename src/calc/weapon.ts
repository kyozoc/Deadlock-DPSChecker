import type { Falloff, GameData, Weapon } from '../types/game-data.ts';
import { headshotMultiplier } from './headshot.ts';
import { effectiveResist, type Stats } from './stats.ts';
import { evalProp } from './values.ts';

export interface WeaponOptions {
  /** 敵との距離 (m) */
  distance: number;
  /** ヘッドショット率 (0〜1) */
  headshotRate: number;
  /** 副射撃で計算する (ある武器のみ) */
  altFire?: boolean;
}

export interface WeaponResult {
  weapon: Weapon;
  /** 1発 (弾1つ) の胴体ダメージ。耐性・減衰込み */
  bodyDamage: number;
  /** 1発のヘッドショットダメージ */
  headDamage: number;
  /** ヘッドショット率を反映した1発の平均ダメージ */
  avgDamage: number;
  /** 1回の射撃で出る弾の数 (ショットガンなど) */
  bulletsPerShot: number;
  roundsPerSecond: number;
  clipSize: number;
  /** 1回の射撃で減る弾数 */
  ammoPerShot: number;
  reloadTime: number;
  falloff: number;
  headshotMultiplier: number;
  /** 敵の実効弾耐性 (%) */
  targetResist: number;
  /** 撃ち続けたときの DPS (リロードなし) */
  burstDps: number;
  /** リロード込みの DPS */
  sustainedDps: number;
  /** ヘッドショット系アイテムの追加ダメージ (クールダウンごと) を秒あたりにならしたもの */
  procDps: number;
  /** 弾倉1つ分のダメージ */
  clipDamage: number;
  /** 倒すのに必要な射撃回数と時間 */
  shotsToKill: number;
  timeToKill: number;
  /** 内訳 */
  breakdown: {
    baseBullet: number;
    levelBonus: number;
    spiritBonus: number;
    weaponDamagePct: number;
    allDamagePct: number;
  };
}

/** 距離によるダメージ減衰の倍率。Source エンジンの Bias 関数で補間する */
export function falloffScale(f: Falloff, distance: number): number {
  if (distance <= f.startRange) return f.startScale;
  if (distance >= f.endRange || f.endRange <= f.startRange) return f.endScale;
  const t = (distance - f.startRange) / (f.endRange - f.startRange);
  const biased = Math.pow(t, Math.log(f.bias) / Math.log(0.5));
  return f.startScale + (f.endScale - f.startScale) * biased;
}

export function weaponDps(
  data: GameData,
  attacker: Stats,
  target: Stats,
  opts: WeaponOptions,
): WeaponResult | null {
  const hero = attacker.hero;
  const weapon = opts.altFire && hero.altFire ? hero.altFire : hero.weapon;
  if (!weapon) return null;

  const spirit = attacker.spiritPower;
  const levelKey = opts.altFire && hero.altFire ? 'BulletDamageAltFire' : 'BulletDamage';
  const levelBonus = attacker.boons * (hero.levelScaling[levelKey] ?? 0);
  const spiritBonus = spirit * (hero.spiritScaling.BulletDamage ?? 0);
  const weaponDamagePct = attacker.sum('weaponDamagePct');
  const allDamagePct = attacker.sum('allDamagePct');

  const targetResist = effectiveResist(target, attacker, 'bullet');
  const falloff = falloffScale(weapon.falloff, opts.distance);
  const hsMult = headshotMultiplier({
    weaponCrit: weapon.crit,
    attacker: hero.stats,
    target: target.hero.stats,
    distance: opts.distance,
  });

  const bullet = weapon.bulletDamage + levelBonus + spiritBonus;
  const bodyDamage =
    bullet * (1 + weaponDamagePct / 100) * (1 + allDamagePct / 100) * falloff * (1 - targetResist / 100);
  const headDamage = bodyDamage * hsMult;
  const avgDamage = bodyDamage * (1 + opts.headshotRate * (hsMult - 1));

  const fireRatePct = attacker.sum('fireRatePct') + spirit * (hero.spiritScaling.FireRate ?? 0);
  // 回転で連射が上がる武器は最大回転時で計算する (Wiki の DPS と同じ前提)
  const baseRps = weapon.spin?.roundsPerSecondAtMaxSpin ?? weapon.roundsPerSecond;
  const roundsPerSecond =
    (baseRps + spirit * (hero.spiritScaling.RoundsPerSecond ?? 0)) * (1 + fireRatePct / 100);
  const clipSize = Math.max(
    1,
    Math.round(
      (weapon.clipSize + spirit * (hero.spiritScaling.ClipSize ?? 0)) * (1 + attacker.sum('clipPct') / 100) +
        attacker.sum('clipFlat'),
    ),
  );
  const reloadTime = Math.max(0, weapon.reloadTime * (1 + attacker.sum('reloadTimePct') / 100));

  // ショットガンのように全弾で1回しか当たらない武器は1発として数える
  const bulletsPerShot = weapon.hitOnceAcrossAllBullets ? 1 : weapon.bulletsPerShot;
  const ammoPerShot = Math.max(1, weapon.ammoPerShot);
  const shotDamage = avgDamage * bulletsPerShot;
  const burstDps = shotDamage * roundsPerSecond;

  const shotsPerClip = Math.max(1, Math.floor(clipSize / ammoPerShot));
  const clipTime = shotsPerClip / roundsPerSecond;
  const fullReload = (weapon.reloadSingle ? reloadTime * clipSize : reloadTime) + weapon.reloadDelay;
  const clipDamage = shotDamage * shotsPerClip;
  const sustainedDps = clipDamage / (clipTime + fullReload);

  const procDps = opts.headshotRate > 0 ? headshotProcDps(data, attacker, targetResist, allDamagePct) : 0;

  // 倒すまで: 射撃回数と、その間のリロードを含めた時間
  const shotsToKill = Math.max(1, Math.ceil(target.maxHealth / shotDamage));
  const reloads = Math.floor((shotsToKill - 1) / shotsPerClip);
  const timeToKill = (shotsToKill - 1) / roundsPerSecond + reloads * fullReload;

  return {
    weapon,
    bodyDamage,
    headDamage,
    avgDamage,
    bulletsPerShot,
    roundsPerSecond,
    clipSize,
    ammoPerShot,
    reloadTime: fullReload,
    falloff,
    headshotMultiplier: hsMult,
    targetResist,
    burstDps,
    sustainedDps,
    procDps,
    clipDamage,
    shotsToKill,
    timeToKill,
    breakdown: { baseBullet: weapon.bulletDamage, levelBonus, spiritBonus, weaponDamagePct, allDamagePct },
  };
}

/**
 * Headshot Booster / Headhunter のような「ヘッドショットで追加ダメージ (クールダウンあり)」のアイテムを、
 * クールダウンが明けるたびに1回発動するとして秒あたりにならす。
 */
function headshotProcDps(data: GameData, attacker: Stats, targetResist: number, allDamagePct: number): number {
  let dps = 0;
  const ctx = { spiritPower: attacker.spiritPower, boons: attacker.boons };
  for (const key of attacker.itemKeys) {
    const item = data.items[key];
    if (!item) continue;
    const section = item.sections.find((s) => s.props.some((p) => p.key === 'HeadShotBonusDamage'));
    if (!section) continue;
    const bonus = evalProp(item.props.HeadShotBonusDamage, ctx);
    const cooldown = section.cooldown ?? evalProp(item.props.AbilityCooldown, ctx);
    if (bonus > 0 && cooldown > 0) {
      dps += (bonus * (1 + allDamagePct / 100) * (1 - targetResist / 100)) / cooldown;
    }
  }
  return dps;
}
