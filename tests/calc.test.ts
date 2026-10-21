import { describe, expect, it } from 'vitest';
import { abilityResults } from '../src/calc/abilities.ts';
import { combineResist, computeStats, effectiveResist, type Build } from '../src/calc/stats.ts';
import { applyUpgrades, evalProp } from '../src/calc/values.ts';
import { falloffScale, weaponDps } from '../src/calc/weapon.ts';
import { gameData as data } from '../src/data/index.ts';
import type { PropMap } from '../src/types/game-data.ts';

function build(overrides: Partial<Build> = {}): Build {
  return { hero: 'hero_haze', souls: 0, items: [], activeItems: [], abilityTiers: [0, 0, 0, 0], activeAbilities: [], ...overrides };
}

const stats = (b: Partial<Build> = {}) => computeStats(data, build(b));

describe('weaponDps', () => {
  it.each(Object.keys(data.heroes).filter((k) => data.heroes[k]!.weapon))(
    '%s matches the Wiki reference DPS with no items at level 0',
    (hero) => {
      const r = weaponDps(data, stats({ hero }), stats({ hero: 'hero_haze' }), { distance: 0, headshotRate: 0 })!;
      const ref = r.weapon.reference;
      expect(r.burstDps).toBeCloseTo(ref.dps, 1);
      expect(r.sustainedDps).toBeCloseTo(ref.sustainedDps, 1);
    },
  );

  it('applies weapon damage, fire rate and the target resist', () => {
    const attacker = stats({ items: ['upgrade_clip_size'] }); // 武器ダメージ +8% と投資ボーナス +9%, 弾倉 +30%
    const target = stats({ hero: 'hero_atlas', items: ['upgrade_improved_bullet_armor'] });
    const r = weaponDps(data, attacker, target, { distance: 0, headshotRate: 0 })!;
    const resist = effectiveResist(target, attacker, 'bullet');
    expect(resist).toBeGreaterThan(0);
    expect(r.bodyDamage).toBeCloseTo(5.26 * 1.17 * (1 - resist / 100));
    expect(r.clipSize).toBe(Math.round(25 * 1.3));
  });

  it('uses the expected headshot multiplier for the given headshot rate', () => {
    const r = weaponDps(data, stats(), stats(), { distance: 0, headshotRate: 0.5 })!;
    expect(r.avgDamage).toBeCloseTo(r.bodyDamage * (1 + 0.5 * 0.65));
  });

  it('reduces damage beyond the falloff start range', () => {
    const near = weaponDps(data, stats(), stats(), { distance: 5, headshotRate: 0 })!;
    const far = weaponDps(data, stats(), stats(), { distance: 100, headshotRate: 0 })!;
    expect(far.bodyDamage).toBeCloseTo(near.bodyDamage * near.weapon.falloff.endScale);
  });

  it('counts shots and reloads needed to kill', () => {
    const r = weaponDps(data, stats(), stats(), { distance: 0, headshotRate: 0 })!;
    expect(r.shotsToKill).toBe(Math.ceil(730 / 5.26));
    expect(r.timeToKill).toBeGreaterThan(r.reloadTime);
  });
});

describe('falloffScale', () => {
  const f = { startRange: 10, endRange: 30, startScale: 1, endScale: 0.1, bias: 0.5 };
  it('is flat before the start and after the end', () => {
    expect(falloffScale(f, 5)).toBe(1);
    expect(falloffScale(f, 40)).toBe(0.1);
  });
  it('interpolates linearly with bias 0.5', () => {
    expect(falloffScale(f, 20)).toBeCloseTo(0.55);
  });
});

describe('computeStats', () => {
  it('counts boons and ability points from souls', () => {
    const s = stats({ souls: 1400 });
    expect(s.boons).toBe(4);
    expect(s.abilityPoints).toBe(2);
  });

  it('adds hero level scaling to health and spirit', () => {
    const s = stats({ souls: 1400 });
    expect(s.maxHealth).toBeCloseTo(730 + 4 * 33);
    expect(s.spiritPower).toBeCloseTo(4 * 0.5);
  });

  it('applies always-on item stats and investment bonuses', () => {
    const s = stats({ items: ['upgrade_improved_spirit'] }); // スピリット +10, 800 ソウル
    expect(s.investment.spirit).toEqual({ souls: 800, bonus: 7 });
    expect(s.spiritPower).toBeCloseTo(10 + 7);
  });

  it('applies conditional item effects only when turned on', () => {
    const off = stats({ items: ['upgrade_warp_stone'] });
    const on = stats({ items: ['upgrade_warp_stone'], activeItems: ['upgrade_warp_stone'] });
    expect(off.sum('bulletResist')).toBe(0);
    expect(on.sum('bulletResist')).toBe(30);
  });

  it('puts resist reduction on the enemy side', () => {
    const s = stats({ items: ['upgrade_bullet_armor_reduction_aura'], activeItems: ['upgrade_bullet_armor_reduction_aura'] });
    expect(s.sum('enemyBulletResist')).toBe(-10);
    expect(effectiveResist(stats(), s, 'bullet')).toBeCloseTo(-10);
  });

  it('applies ability buffs only when turned on, including upgrades', () => {
    const on = stats({ activeAbilities: [3], abilityTiers: [0, 0, 0, 2] });
    expect(on.sum('fireRatePct')).toBe(25 + 10);
    expect(stats({ abilityTiers: [0, 0, 0, 2] }).sum('fireRatePct')).toBe(0);
  });
});

describe('combineResist', () => {
  it('stacks multiplicatively', () => {
    expect(combineResist([30, 30])).toBeCloseTo(51);
    expect(combineResist([])).toBe(0);
    expect(combineResist([-10])).toBeCloseTo(-10);
  });
});

describe('values', () => {
  it('evaluates spirit and boon scaling', () => {
    const v = { value: 65, scale: [{ type: 'spirit', value: 2.2 }, { type: 'duration', value: 1 }] };
    expect(evalProp(v, { spiritPower: 10, boons: 3 })).toBeCloseTo(87);
    expect(evalProp({ value: 75, scale: [{ type: 'power_increase', value: 4 }] }, { spiritPower: 0, boons: 3 })).toBe(87);
  });

  it('applies upgrades up to the chosen tier', () => {
    const props = { AbilityCooldown: 30, Damage: { value: 65, scale: [{ type: 'spirit', value: 2.2 }] } };
    const upgrades: PropMap[] = [{ Damage: 20 }, { AbilityCooldown: -10 }, { Damage: { value: 2, scale: [], multiply: true as const } }];
    expect(applyUpgrades(props, upgrades, 1)).toEqual({ AbilityCooldown: 30, Damage: { value: 85, scale: [{ type: 'spirit', value: 2.2 }] } });
    expect(applyUpgrades(props, upgrades, 3)).toEqual({
      AbilityCooldown: 20,
      Damage: { value: 170, scale: [{ type: 'spirit', value: 4.4 }] },
    });
  });
});

describe('abilityResults', () => {
  it('computes spirit damage with spirit power, upgrades and cooldown', () => {
    const attacker = stats({ items: ['upgrade_improved_spirit'], abilityTiers: [3, 0, 0, 0] });
    const [dagger] = abilityResults(data, attacker, stats(), attacker.hero.abilities.map((_, i) => (i === 0 ? 3 : 0)));
    expect(dagger!.ability.key).toBe('ability_sleep_dagger');
    expect(dagger!.cooldown).toBeCloseTo(30 - 17);
    expect(dagger!.lines[0]!.raw).toBeCloseTo(65 + 2.2 * 17);
    expect(dagger!.totalPerCast).toBeCloseTo(65 + 2.2 * 17);
  });
});
