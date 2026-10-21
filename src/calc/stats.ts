import type { GameData, Hero, Item, ItemSlot, LocalizedText, PropMap } from '../types/game-data.ts';
import { applyUpgrades, evalProp, type ScaleContext } from './values.ts';

/** 1人分の構成 (ヒーロー・ソウル・アイテム・スキル) */
export interface Build {
  hero: string;
  souls: number;
  items: string[];
  /** 条件付き効果 (発動・バフ・デバフ) を有効にしているアイテム */
  activeItems: string[];
  /** シグネチャーアビリティ1〜4の強化段階 (0〜3) */
  abilityTiers: number[];
  /** 効果 (バフ・デバフ) を有効にしているアビリティの番号 (0〜3) */
  activeAbilities: number[];
}

export type StatKey =
  | 'spiritPower'
  | 'spiritPowerPct'
  | 'weaponDamagePct'
  | 'fireRatePct'
  | 'clipPct'
  | 'clipFlat'
  | 'reloadTimePct'
  | 'bulletResist'
  | 'spiritResist'
  | 'maxHealth'
  | 'baseHealthPct'
  | 'spiritDamagePct'
  | 'allDamagePct'
  | 'cooldownReductionPct'
  /** 敵に付ける弾耐性低下 (負の値) */
  | 'enemyBulletResist'
  /** 敵に付けるスピリット耐性低下 (負の値) */
  | 'enemySpiritResist';

export interface Source {
  kind: 'hero' | 'level' | 'item' | 'ability' | 'investment';
  key: string;
  label: LocalizedText;
}

export interface Modifier {
  stat: StatKey;
  value: number;
  source: Source;
}

/**
 * プロパティ名 → 効くステータス。ここに無いプロパティは DPS 計算には使わない。
 * 対応表はゲームの m_eProvidedPropertyType (vdata) を元にしている。
 */
export const PROP_EFFECTS: Record<string, StatKey> = {
  BaseAttackDamagePercent: 'weaponDamagePct',
  BonusFireRate: 'fireRatePct',
  FireRateBonus: 'fireRatePct',
  ActivatedFireRate: 'fireRatePct',
  ActiveBonusFireRate: 'fireRatePct',
  BonusClipSizePercent: 'clipPct',
  BonusClipSize: 'clipFlat',
  ReloadSpeedMultipler: 'reloadTimePct',
  TechPower: 'spiritPower',
  SpiritPower: 'spiritPower',
  BonusSpirit: 'spiritPower',
  TechPowerPercent: 'spiritPowerPct',
  BulletResist: 'bulletResist',
  BuffBulletResist: 'bulletResist',
  TechResist: 'spiritResist',
  BuffTechResist: 'spiritResist',
  BonusHealth: 'maxHealth',
  BonusBaseHealth: 'baseHealthPct',
  TechDamagePercent: 'spiritDamagePct',
  BonusDamagePercent: 'allDamagePct',
  CooldownReduction: 'cooldownReductionPct',
  BulletResistReduction: 'enemyBulletResist',
  BulletArmorReduction: 'enemyBulletResist',
  TechArmorDamageReduction: 'enemySpiritResist',
  MagicResistReduction: 'enemySpiritResist',
};

const INVESTMENT_STAT: Record<ItemSlot, StatKey> = {
  weapon: 'weaponDamagePct',
  vitality: 'baseHealthPct',
  spirit: 'spiritPower',
};

const SLOT_LABEL: Record<ItemSlot, LocalizedText> = {
  weapon: { en: 'Weapon investment', ja: 'ウェポン投資ボーナス' },
  vitality: { en: 'Vitality investment', ja: 'バイタリティ投資ボーナス' },
  spirit: { en: 'Spirit investment', ja: 'スピリット投資ボーナス' },
};

export interface Stats {
  hero: Hero;
  /** 持っているアイテム */
  itemKeys: Set<string>;
  boons: number;
  /** 使えるスキルポイントの合計 */
  abilityPoints: number;
  spiritPower: number;
  maxHealth: number;
  /** 自分に付く補正 */
  modifiers: Modifier[];
  /** 敵に付ける補正 (耐性低下など) */
  enemyModifiers: Modifier[];
  /** 系統ごとに使ったソウルと投資ボーナス */
  investment: Record<ItemSlot, { souls: number; bonus: number }>;
  /** 合計 (足し算) */
  sum(stat: StatKey): number;
}

export function computeStats(data: GameData, build: Build): Stats {
  const hero = data.heroes[build.hero];
  if (!hero) throw new Error(`unknown hero ${build.hero}`);

  const unlocked = data.soulUnlocks.filter((u) => u.souls <= build.souls);
  const boons = unlocked.filter((u) => u.powerIncrease).length;
  const abilityPoints = unlocked.reduce((n, u) => n + u.abilityPoints, 0);

  const items = build.items.map((k) => data.items[k]).filter((i): i is Item => !!i);
  const active = new Set(build.activeItems);

  const investment = {} as Stats['investment'];
  for (const slot of ['weapon', 'vitality', 'spirit'] as const) {
    const souls = items.filter((i) => i.slot === slot).reduce((n, i) => n + i.cost, 0);
    const tier = [...data.investment[slot]].reverse().find((t) => t.souls <= souls);
    investment[slot] = { souls, bonus: tier?.bonus ?? 0 };
  }

  const heroSource: Source = { kind: 'hero', key: hero.key, label: hero.name };
  const levelSource: Source = { kind: 'level', key: 'boons', label: { en: `Level (${boons} boons)`, ja: `レベル (ブーン ${boons})` } };

  // スピリットパワーは他の値のスケーリングに使うので先に決める (自分自身はブーン数でしかスケールしない)
  const collect = (ctx: ScaleContext) => {
    const self: Modifier[] = [];
    const enemy: Modifier[] = [];
    const push = (stat: StatKey | undefined, value: number, source: Source) => {
      if (!stat || !value) return;
      (stat.startsWith('enemy') ? enemy : self).push({ stat, value, source });
    };

    push('spiritPower', boons * (hero.levelScaling.TechPower ?? 0), levelSource);
    push('bulletResist', hero.stats.bulletResist, heroSource);
    push('spiritResist', hero.stats.spiritResist, heroSource);
    push('bulletResist', boons * (hero.levelScaling.BulletResist ?? 0), levelSource);
    push('spiritResist', boons * (hero.levelScaling.TechResist ?? 0), levelSource);

    for (const slot of ['weapon', 'vitality', 'spirit'] as const) {
      push(INVESTMENT_STAT[slot], investment[slot].bonus, { kind: 'investment', key: slot, label: SLOT_LABEL[slot] });
    }

    for (const item of items) {
      const source: Source = { kind: 'item', key: item.key, label: item.name };
      const seen = new Set<string>();
      for (const section of item.sections) {
        for (const p of section.props) {
          if (seen.has(p.key)) continue;
          const on = p.usage === 'always' || active.has(item.key);
          if (!on) continue;
          seen.add(p.key);
          push(PROP_EFFECTS[p.key], evalProp(item.props[p.key], ctx), source);
        }
      }
    }

    hero.abilities.forEach((key, index) => {
      const ability = data.abilities[key];
      if (!ability || !build.activeAbilities.includes(index)) return;
      const props: PropMap = applyUpgrades(ability.props, ability.upgrades, build.abilityTiers[index] ?? 0);
      const source: Source = { kind: 'ability', key, label: ability.name };
      for (const [prop, value] of Object.entries(props)) {
        push(PROP_EFFECTS[prop], evalProp(value, ctx), source);
      }
    });

    return { self, enemy };
  };

  const sumOf = (mods: Modifier[], stat: StatKey) => mods.filter((m) => m.stat === stat).reduce((n, m) => n + m.value, 0);

  const first = collect({ spiritPower: 0, boons });
  const spiritFlat = sumOf(first.self, 'spiritPower');
  const spiritPower = spiritFlat * (1 + sumOf(first.self, 'spiritPowerPct') / 100);
  // スピリットでスケールする値 (Spirit Scaling の弾耐性など) を含めて計算し直す
  const { self, enemy } = collect({ spiritPower, boons });
  for (const [stat, key] of [
    ['bulletResist', 'BulletResist'],
    ['spiritResist', 'TechResist'],
  ] as const) {
    const v = (hero.spiritScaling[key] ?? 0) * spiritPower;
    if (v) self.push({ stat, value: v, source: { kind: 'hero', key: 'spirit-scaling', label: { en: 'Spirit scaling', ja: 'スピリットによる成長' } } });
  }

  const baseHealth = hero.stats.maxHealth + boons * (hero.levelScaling.MaxHealth ?? 0);
  const maxHealth = baseHealth * (1 + sumOf(self, 'baseHealthPct') / 100) + sumOf(self, 'maxHealth');

  return {
    hero,
    itemKeys: new Set(items.map((i) => i.key)),
    boons,
    abilityPoints,
    spiritPower,
    maxHealth,
    modifiers: self,
    enemyModifiers: enemy,
    investment,
    sum: (stat) => sumOf(stat.startsWith('enemy') ? enemy : self, stat),
  };
}

/**
 * 耐性の合成。複数の耐性は掛け算で重なる (30% と 30% で 51%) として、
 * 耐性低下 (負の値) も同じ式に入れる。ゲーム内で未検証の仮定。
 */
export function combineResist(values: number[]): number {
  const remaining = values.reduce((p, v) => p * (1 - v / 100), 1);
  return Math.min(100, (1 - remaining) * 100);
}

/** 攻撃側から見た、敵の実効耐性 (%) */
export function effectiveResist(target: Stats, attacker: Stats, kind: 'bullet' | 'spirit'): number {
  const own = target.modifiers.filter((m) => m.stat === (kind === 'bullet' ? 'bulletResist' : 'spiritResist'));
  const shred = attacker.enemyModifiers.filter((m) => m.stat === (kind === 'bullet' ? 'enemyBulletResist' : 'enemySpiritResist'));
  return combineResist([...own, ...shred].map((m) => m.value));
}

/** クールダウン短縮も掛け算で重なるとする */
export function cooldownMultiplier(stats: Stats): number {
  return stats.modifiers
    .filter((m) => m.stat === 'cooldownReductionPct')
    .reduce((p, m) => p * (1 - m.value / 100), 1);
}
