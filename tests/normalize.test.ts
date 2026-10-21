import { describe, expect, it } from 'vitest';
import { buildGameData, normalizeProps, type RawInputs } from '../scripts/lib/normalize.ts';

function inputs(overrides: Partial<RawInputs> = {}): RawInputs {
  return {
    heroData: {
      hero_haze: {
        Name: 'Haze',
        Type: 'Assassin',
        IsSelectable: true,
        IsDisabled: false,
        InDevelopment: false,
        MaxHealth: 730,
        BoundAbilities: { '1': { Key: 'ability_sleep_dagger' } },
        LevelScaling: { BulletDamage: 0.143, PowerIncreases: 1, DPS: 1.36 },
        SpiritScaling: { ClipSize: 0.5, SustainedDPS: 0.25 },
        Weapon: {
          NameKey: 'citadel_weapon_haze_wrong_key',
          BulletDamage: 5.26,
          RoundsPerSecond: 9.5238,
          ClipSize: 25,
          FalloffStartRange: 19.99,
          CanCrit: true,
          DPS: 50.095,
          SustainedDPS: 26.432,
        },
      },
      hero_wip: { Name: 'WIP', IsSelectable: true, InDevelopment: true },
    },
    abilityData: {
      ability_sleep_dagger: {
        Name: 'Sleep Dagger',
        Damage: { Value: 65, Scale: { Value: 2.2, Type: 'spirit' } },
        Upgrades: [{ AbilityCooldown: -17 }],
      },
    },
    itemData: {
      upgrade_toxic_bullets: {
        Name: 'Toxic Bullets',
        Cost: 3200,
        Tier: 3,
        Slot: 'Weapon',
        Activation: 'Passive',
        IsDisabled: false,
        DotDuration: 4,
        PropertyUpgrades: { DotHealthPercent: 0.7 },
      },
      upgrade_disabled: { Name: 'Old', Cost: 500, Tier: 1, Slot: 'Tech', IsDisabled: true },
      upgrade_no_tier: { Name: 'Hidden', Slot: 'Armor', IsDisabled: false },
    },
    soulUnlockData: [
      { RequiredSouls: 200, PowerIncrease: true, AbilityPoints: 1 },
      { RequiredSouls: 0, AbilityUnlocks: 1 },
    ],
    japanese: { hero_haze: 'ヘイズ', upgrade_toxic_bullets: 'トキシックバレット' },
    heroesVdata: {
      hero_haze: { m_HeroID: 13, m_mapBoundAbilities: { ESlot_Weapon_Primary: 'citadel_weapon_haze_set' } },
    },
    abilitiesVdata: {
      hero_weapon_base: {
        m_mapWeaponInfos: { primary: { m_flCritBonusStartRange: 500, m_flCritBonusEndRange: 1500 } },
      },
      citadel_weapon_haze_set: {
        _multibase: ['hero_weapon_base'],
        m_mapWeaponInfos: { primary: { m_flCritBonusStart: 1.65, m_flCritBonusEnd: 1.65 } },
      },
    },
    gameVersion: 6807,
    vdataVersion: 6807,
    ...overrides,
  };
}

describe('buildGameData', () => {
  it('keeps only playable heroes and attaches localized names and hero id', () => {
    const data = buildGameData(inputs());
    expect(Object.keys(data.heroes)).toEqual(['hero_haze']);
    const haze = data.heroes.hero_haze!;
    expect(haze.id).toBe(13);
    expect(haze.name).toEqual({ en: 'Haze', ja: 'ヘイズ' });
    expect(haze.stats.maxHealth).toBe(730);
    expect(haze.stats.bulletResist).toBe(0);
  });

  it('drops derived DPS values from scaling tables', () => {
    const haze = buildGameData(inputs()).heroes.hero_haze!;
    expect(haze.levelScaling).toEqual({ BulletDamage: 0.143 });
    expect(haze.spiritScaling).toEqual({ ClipSize: 0.5 });
  });

  it('reads headshot values via the vdata weapon slot, inheriting from bases and converting to meters', () => {
    const weapon = buildGameData(inputs()).heroes.hero_haze!.weapon!;
    expect(weapon.key).toBe('citadel_weapon_haze_set');
    expect(weapon.crit).toEqual({
      canCrit: true,
      bonusStart: 1.65,
      bonusEnd: 1.65,
      startRange: 12.7,
      endRange: 38.1,
      againstNpcs: 0,
    });
    expect(weapon.reference).toEqual({ dps: 50.095, sustainedDps: 26.432 });
  });

  it('warns when the headshot values cannot be found', () => {
    const data = buildGameData(inputs({ abilitiesVdata: {} }));
    expect(data.heroes.hero_haze!.weapon!.crit).toBeNull();
    expect(data.meta.warnings).toContain('hero_haze: 武器のヘッドショット倍率が vdata から取れない');
  });

  it('warns on a build mismatch between sources', () => {
    const data = buildGameData(inputs({ vdataVersion: 6808 }));
    expect(data.meta.warnings[0]).toMatch(/6807.*6808/);
  });

  it('includes only abilities bound to included heroes', () => {
    const data = buildGameData(inputs());
    expect(data.abilities.ability_sleep_dagger).toEqual({
      key: 'ability_sleep_dagger',
      name: { en: 'Sleep Dagger' },
      hero: 'hero_haze',
      props: { Damage: { value: 65, scale: [{ type: 'spirit', value: 2.2 }] } },
      upgrades: [{ AbilityCooldown: -17 }],
    });
  });

  it('keeps shop items only and maps slots', () => {
    const data = buildGameData(inputs());
    expect(Object.keys(data.items)).toEqual(['upgrade_toxic_bullets']);
    expect(data.items.upgrade_toxic_bullets).toMatchObject({
      slot: 'weapon',
      tier: 3,
      cost: 3200,
      props: { DotDuration: 4 },
      upgradeBonus: { DotHealthPercent: 0.7 },
      corruptedBonus: null,
    });
  });

  it('sorts soul unlocks by souls', () => {
    const data = buildGameData(inputs());
    expect(data.soulUnlocks.map((u) => u.souls)).toEqual([0, 200]);
    expect(data.soulUnlocks[1]).toEqual({ souls: 200, powerIncrease: true, abilityPoints: 1, abilityUnlocks: 0 });
  });
});

describe('normalizeProps', () => {
  it('keeps numbers and scaled values, drops strings, flags and modifier definitions', () => {
    expect(
      normalizeProps({
        Name: 'x',
        IsDisabled: false,
        BehaviourBits: ['A'],
        DebuffModifier: { Class: 'Slow' },
        Radius: 16,
        AbilityDuration: { Value: 3.5, Scale: [{ Value: 0.03, Type: 'spirit' }, { Value: 1, Type: 'duration' }] },
      }),
    ).toEqual({
      Radius: 16,
      AbilityDuration: {
        value: 3.5,
        scale: [
          { type: 'spirit', value: 0.03 },
          { type: 'duration', value: 1 },
        ],
      },
    });
  });

  it('keeps multiply flags from upgrades', () => {
    expect(
      normalizeProps({
        DamagePerSecond: { Value: 1.3333, Scale: { Value: 1.3333, Type: 'spirit', Multiply: true }, Multiply: true },
        SilenceDuration: { Value: 1.3333, Multiply: true },
      }),
    ).toEqual({
      DamagePerSecond: { value: 1.3333, scale: [{ type: 'spirit', value: 1.3333, multiply: true }], multiply: true },
      SilenceDuration: { value: 1.3333, scale: [], multiply: true },
    });
  });
});
