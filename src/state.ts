import type { Build } from './calc/stats.ts';
import { gameData } from './data/index.ts';

export interface AppState {
  me: Build;
  enemy: Build;
  /** 敵との距離 (m) */
  distance: number;
  /** ヘッドショット率 (%) */
  headshotRate: number;
  altFire: boolean;
}

export const MAX_ITEMS = 16;
export const MAX_SOULS = 50000;

export function emptyBuild(hero: string, souls = 10000): Build {
  return { hero, souls, items: [], activeItems: [], abilityTiers: [0, 0, 0, 0], activeAbilities: [] };
}

export const DEFAULT_STATE: AppState = {
  me: emptyBuild('hero_haze'),
  enemy: emptyBuild('hero_atlas'),
  distance: 15,
  headshotRate: 20,
  altFire: false,
};

/** URL の #s=... に状態を入れて共有できるようにする */
export function encodeState(state: AppState): string {
  const compact = [packBuild(state.me), packBuild(state.enemy), state.distance, state.headshotRate, state.altFire ? 1 : 0];
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeState(hash: string): AppState | null {
  const m = hash.match(/s=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'))));
    const [me, enemy, distance, headshotRate, altFire] = JSON.parse(json) as unknown[];
    const a = unpackBuild(me);
    const b = unpackBuild(enemy);
    if (!a || !b) return null;
    return {
      me: a,
      enemy: b,
      distance: clampNumber(distance, 0, 100, DEFAULT_STATE.distance),
      headshotRate: clampNumber(headshotRate, 0, 100, DEFAULT_STATE.headshotRate),
      altFire: altFire === 1,
    };
  } catch {
    return null;
  }
}

function packBuild(b: Build): unknown[] {
  return [b.hero, b.souls, b.items, b.activeItems, b.abilityTiers, b.activeAbilities];
}

function unpackBuild(raw: unknown): Build | null {
  if (!Array.isArray(raw)) return null;
  const [hero, souls, items, activeItems, abilityTiers, activeAbilities] = raw;
  if (typeof hero !== 'string' || !gameData.heroes[hero]) return null;
  const knownItems = strings(items).filter((k) => gameData.items[k]).slice(0, MAX_ITEMS);
  return {
    hero,
    souls: clampNumber(souls, 0, MAX_SOULS, 10000),
    items: knownItems,
    activeItems: strings(activeItems).filter((k) => knownItems.includes(k)),
    abilityTiers: [0, 1, 2, 3].map((i) => clampNumber(Array.isArray(abilityTiers) ? abilityTiers[i] : 0, 0, 3, 0)),
    activeAbilities: (Array.isArray(activeAbilities) ? activeAbilities : []).filter(
      (n): n is number => Number.isInteger(n) && n >= 0 && n < 4,
    ),
  };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
