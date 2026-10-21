import { describe, expect, it } from 'vitest';
import { deadlockApiUrl, HERO_ANCHORS, ITEM_ANCHORS } from '../scripts/lib/image-paths.ts';

const BASE = 'https://assets-bucket.deadlock-api.com/assets-api-res/images';

describe('deadlockApiUrl', () => {
  it('maps hero portraits under heroes/', () => {
    expect(deadlockApiUrl('file://{images}/heroes/haze_card.psd', HERO_ANCHORS)).toBe(`${BASE}/heroes/haze_card.png`);
    expect(deadlockApiUrl('file://{images}/heroes/hornet_sm.png', HERO_ANCHORS)).toBe(`${BASE}/heroes/hornet_sm.png`);
  });

  it('maps item and ability icons from their anchor folder', () => {
    expect(deadlockApiUrl('file://{images}/upgrades/mods_weapon/headshot_booster.psd', ITEM_ANCHORS)).toBe(
      `${BASE}/upgrades/mods_weapon/headshot_booster.png`,
    );
    expect(deadlockApiUrl('file://{images}/hud/abilities/chess/chessmaster_bishop.psd', ITEM_ANCHORS)).toBe(
      `${BASE}/abilities/chess/chessmaster_bishop.png`,
    );
    expect(deadlockApiUrl('file://{images}/items/weapon/spell_slinger.psd', ITEM_ANCHORS)).toBe(
      `${BASE}/items/weapon/spell_slinger.png`,
    );
  });

  it('skips svg icons and missing paths', () => {
    expect(deadlockApiUrl('file://{images}/hud/modifiers/icon_parry.svg', ITEM_ANCHORS)).toBeUndefined();
    expect(deadlockApiUrl(undefined, ITEM_ANCHORS)).toBeUndefined();
  });
});
