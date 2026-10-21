import { describe, expect, it } from 'vitest';
import { headshotMultiplier } from '../src/calc/headshot.ts';
import { gameData } from '../src/data/index.ts';

const hero = (key: string) => gameData.heroes[key]!;

function vs(attackerKey: string, targetKey: string, extraBonus?: number): number {
  const attacker = hero(attackerKey);
  return headshotMultiplier({
    weaponCrit: attacker.weapon!.crit,
    attacker: attacker.stats,
    target: hero(targetKey).stats,
    extraBonus,
  });
}

describe('headshotMultiplier', () => {
  it('is 1.65 for a standard hero against a standard hero', () => {
    expect(vs('hero_haze', 'hero_haze')).toBeCloseTo(1.65);
  });

  it('applies the attacker headshot bonus additively (Wiki formula)', () => {
    expect(vs('hero_drifter', 'hero_haze')).toBeCloseTo(1.2); // 1 + (0.65 - 0.45)
    expect(vs('hero_viper', 'hero_haze')).toBeCloseTo(1.35); // 1 + (0.65 - 0.30)
    expect(vs('hero_kelvin', 'hero_haze')).toBeCloseTo(1.4); // 1 + (0.65 - 0.25)
  });

  it('uses the weapon value for Ratking', () => {
    expect(vs('hero_ratking', 'hero_haze')).toBeCloseTo(1.35);
  });

  it('scales the bonus by the target headshot resistance', () => {
    expect(vs('hero_haze', 'hero_gigawatt')).toBeCloseTo(1 + 0.65 * 0.45);
    expect(vs('hero_drifter', 'hero_krill')).toBeCloseTo(1 + 0.2 * 0.8);
  });

  it('adds extra bonuses from items before the target resistance', () => {
    expect(vs('hero_haze', 'hero_haze', 0.2)).toBeCloseTo(1.85);
    expect(vs('hero_haze', 'hero_gigawatt', 0.2)).toBeCloseTo(1 + 0.85 * 0.45);
  });

  it('returns 1 for weapons that cannot crit', () => {
    const crit = { ...hero('hero_haze').weapon!.crit!, canCrit: false };
    expect(
      headshotMultiplier({ weaponCrit: crit, attacker: { critBonusScale: 1 }, target: { critReceivedScale: 1 } }),
    ).toBe(1);
  });

  it('falls back to the standard weapon bonus when crit data is missing', () => {
    expect(
      headshotMultiplier({ weaponCrit: null, attacker: { critBonusScale: 1 }, target: { critReceivedScale: 1 } }),
    ).toBeCloseTo(1.65);
  });
});
