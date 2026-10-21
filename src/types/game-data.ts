/**
 * DPS計算用に整形したゲームデータの型。
 * `npm run data:fetch` が生成する src/data/game-data.json はこの形になる。
 *
 * 距離は m、時間は秒、割合系 (〜Percent / 〜Resist) は % の数値 (10 = 10%)。
 */

export interface GameData {
  meta: Meta;
  heroes: Record<string, Hero>;
  abilities: Record<string, Ability>;
  items: Record<string, Item>;
  /** ソウル数ごとの解放内容 (ブーン・アビリティポイント)。昇順 */
  soulUnlocks: SoulUnlock[];
}

export interface Meta {
  /** deadlock-data (Wiki) 側のゲームビルド番号 */
  gameVersion: number;
  /** GameTracking (生 vdata) 側のゲームビルド番号。gameVersion とずれていたら要注意 */
  vdataVersion: number;
  /** 取得時に見つかった欠損など */
  warnings: string[];
}

export interface LocalizedText {
  en: string;
  ja?: string;
}

/** スケーリング1項。type は 'spirit' | 'duration' | 'cooldown' | 'range' | 'radius' | 'power_increase' など */
export interface Scale {
  type: string;
  value: number;
  /** true なら加算でなく乗算 (主にアップグレード) */
  multiply?: true;
}

/** 「基礎値 + Σ(ステータス × 係数)」で決まる値。例: Damage = 65 + スピリット × 2.2 */
export interface ScaledValue {
  value: number;
  scale: Scale[];
  multiply?: true;
}

export type PropValue = number | ScaledValue;
/** ゲーム内プロパティ名 (Damage, AbilityCooldown, TechPower など) → 値 */
export type PropMap = Record<string, PropValue>;

export interface Hero {
  key: string;
  /** ゲーム内のヒーローID (Deadlock API の画像取得などに使う) */
  id: number | null;
  name: LocalizedText;
  /** 'Assassin' など */
  type: string | null;
  stats: HeroStats;
  /** ブーン (パワー増加) 1回あたりの成長量。BulletDamage, MaxHealth, TechPower など */
  levelScaling: Record<string, number>;
  /** スピリット1あたりの武器ステータス成長。ClipSize など */
  spiritScaling: Record<string, number>;
  weapon: Weapon | null;
  altFire: Weapon | null;
  /** シグネチャーアビリティ1〜4のキー */
  abilities: string[];
}

export interface HeroStats {
  maxHealth: number;
  baseHealthRegen: number;
  bulletResist: number;
  spiritResist: number;
  meleeResist: number;
  /**
   * 与ヘッドショットの倍率 (vdata の ECritDamageBonusScale)。1 が標準、Drifter は 0.55。
   * 計算式は src/calc/headshot.ts
   */
  critBonusScale: number;
  /** 被ヘッドショットの倍率 (vdata の ECritDamageReceivedScale)。1 が標準、Gigawatt は 0.45 */
  critReceivedScale: number;
  lightMeleeDamage: number;
  heavyMeleeDamage: number;
  bulletLifesteal: number;
  maxMoveSpeed: number;
  sprintSpeed: number;
}

export interface Weapon {
  key: string;
  bulletDamage: number;
  bulletsPerShot: number;
  /** 1秒あたりの発射回数 (バースト武器はバースト単位) */
  roundsPerSecond: number;
  bulletsPerBurst: number;
  burstInterShotInterval: number;
  clipSize: number;
  ammoPerShot: number;
  reloadTime: number;
  /** true なら1発ずつリロード (ショットガン等) */
  reloadSingle: boolean;
  reloadDelay: number;
  falloff: Falloff;
  crit: Crit | null;
  /** 回転数で連射が上がる武器のみ */
  spin: Spin | null;
  /** 爆発弾の武器のみ */
  explosion: Explosion | null;
  hitOnceAcrossAllBullets: boolean;
  weaponTypes: string[];
  /** Wiki 側の計算値。自前の計算の検算用 */
  reference: { dps: number; sustainedDps: number };
}

export interface Falloff {
  startRange: number;
  endRange: number;
  startScale: number;
  endScale: number;
  bias: number;
}

/**
 * 武器側のヘッドショット倍率。距離 startRange〜endRange で bonusStart → bonusEnd に変化。
 * ほぼ全武器 1.65 (Ratking のみ 1.35)。ヒーローごとの差は HeroStats.critBonusScale 側にある
 */
export interface Crit {
  canCrit: boolean;
  bonusStart: number;
  bonusEnd: number;
  startRange: number;
  endRange: number;
  /** vdata の m_flCritBonusAgainstNPCs そのまま (全武器 0。意味は要検証) */
  againstNpcs: number;
}

export interface Spin {
  roundsPerSecondAtMaxSpin: number;
  acceleration: number;
  deceleration: number;
}

export interface Explosion {
  radius: number;
  damageScaleAtMaxRadius: number;
}

export interface Ability {
  key: string;
  name: LocalizedText;
  /** このアビリティを持つヒーローのキー */
  hero: string;
  props: PropMap;
  /** スキルポイントによる強化 T1〜T3。基礎値への加算 (multiply なら乗算) */
  upgrades: PropMap[];
}

export type ItemSlot = 'weapon' | 'vitality' | 'spirit';

export interface Item {
  key: string;
  name: LocalizedText;
  slot: ItemSlot;
  tier: number;
  cost: number;
  /** 'Passive' | 'InstantCast' | 'Press' など */
  activation: string;
  /** 合成元アイテムのキー */
  components: string[];
  isImbue: boolean;
  /** Street Brawl 専用 */
  streetBrawl: boolean;
  props: PropMap;
  /** アイテム強化時の加算値 */
  upgradeBonus: PropMap | null;
  /** Corrupted 版の加算値 */
  corruptedBonus: PropMap | null;
}

export interface SoulUnlock {
  souls: number;
  powerIncrease: boolean;
  abilityPoints: number;
  abilityUnlocks: number;
}
