import type { Ability, GameData, LocalizedText } from '../types/game-data.ts';
import { cooldownMultiplier, effectiveResist, PROP_EFFECTS, type Stats } from './stats.ts';
import { applyUpgrades, evalProp } from './values.ts';

export interface AbilityDamageLine {
  key: string;
  label: LocalizedText;
  /** スピリット・強化込みの値 (耐性前) */
  raw: number;
  /** 耐性・スピリットダメージ増加込みの値 */
  dealt: number;
  /** 秒あたりの値 (DPS 系のプロパティ) */
  perSecond: boolean;
  /** % 表記の値 (最大体力の % ダメージなど)。耐性はかけない */
  percent: boolean;
}

export interface AbilityResult {
  ability: Ability;
  index: number;
  tier: number;
  cooldown: number;
  lines: AbilityDamageLine[];
  /** 敵に当てたときの合計ダメージ (1回あたり、DPS 系は除く) */
  totalPerCast: number;
  /** バフ・デバフとして DPS 計算に反映できるプロパティを持っているか */
  hasEffects: boolean;
}

const DAMAGE_KINDS = new Set(['tech_damage']);

export function abilityResults(data: GameData, attacker: Stats, target: Stats, tiers: number[]): AbilityResult[] {
  const ctx = { spiritPower: attacker.spiritPower, boons: attacker.boons };
  const resist = effectiveResist(target, attacker, 'spirit');
  const amp = (1 + attacker.sum('spiritDamagePct') / 100) * (1 + attacker.sum('allDamagePct') / 100);

  return attacker.hero.abilities.flatMap((key, index) => {
    const ability = data.abilities[key];
    if (!ability) return [];
    const tier = tiers[index] ?? 0;
    const props = applyUpgrades(ability.props, ability.upgrades, tier);

    const lines: AbilityDamageLine[] = ability.card
      .filter((c) => c.kind && DAMAGE_KINDS.has(c.kind) && props[c.key] !== undefined)
      .map((c) => {
        const raw = evalProp(props[c.key], ctx);
        const percent = /Percent|Pct/.test(c.key);
        return {
          key: c.key,
          label: data.labels[c.key] ?? { en: c.key },
          raw,
          dealt: percent ? raw : raw * amp * (1 - resist / 100),
          perSecond: /DPS|PerSecond/i.test(c.key),
          percent,
        };
      })
      .filter((l) => l.raw > 0);

    const cooldown = evalProp(props.AbilityCooldown, ctx) * cooldownMultiplier(attacker);
    const totalPerCast = lines.filter((l) => !l.perSecond && !l.percent).reduce((n, l) => n + l.dealt, 0);
    const hasEffects = Object.keys(props).some((p) => p in PROP_EFFECTS);

    return [{ ability, index, tier, cooldown, lines, totalPerCast, hasEffects }];
  });
}
