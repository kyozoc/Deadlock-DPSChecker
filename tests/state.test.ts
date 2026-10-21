import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from '../src/state.ts';

describe('share URL state', () => {
  it('round-trips a build through the URL hash', () => {
    const state: AppState = {
      ...DEFAULT_STATE,
      me: {
        hero: 'hero_haze',
        souls: 23400,
        items: ['upgrade_headshot_booster', 'upgrade_warp_stone'],
        activeItems: ['upgrade_warp_stone'],
        abilityTiers: [1, 0, 3, 2],
        activeAbilities: [3],
      },
      distance: 22,
      headshotRate: 35,
      altFire: true,
    };
    expect(decodeState(`#s=${encodeState(state)}`)).toEqual(state);
  });

  it('drops unknown heroes and items instead of failing', () => {
    const state = { ...DEFAULT_STATE, me: { ...DEFAULT_STATE.me, items: ['upgrade_headshot_booster', 'upgrade_removed_item'] } };
    expect(decodeState(`#s=${encodeState(state)}`)!.me.items).toEqual(['upgrade_headshot_booster']);
    const badHero = { ...DEFAULT_STATE, me: { ...DEFAULT_STATE.me, hero: 'hero_nope' } };
    expect(decodeState(`#s=${encodeState(badHero)}`)).toBeNull();
  });

  it('returns null for a missing or broken hash', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#s=!!!')).toBeNull();
  });
});
