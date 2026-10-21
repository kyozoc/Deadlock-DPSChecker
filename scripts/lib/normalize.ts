/**
 * deadlock-data (Wiki が生成した JSON) と GameTracking の生 vdata から、
 * DPS 計算に必要な項目だけを src/types/game-data.ts の形に整形する。
 * ネットワークには触らない純粋関数にしてテストしやすくしている。
 */
import type {
  Ability,
  Crit,
  GameData,
  Hero,
  HeroStats,
  Item,
  ItemSlot,
  LocalizedText,
  PropMap,
  PropValue,
  Scale,
  SoulUnlock,
  Weapon,
} from '../../src/types/game-data.ts';
import { isObject, type Kv3Object, type Kv3Value } from './kv3.ts';

// 外部 JSON の境界なので緩い型で受ける
type Raw = Record<string, any>;

export interface RawInputs {
  heroData: Raw;
  abilityData: Raw;
  itemData: Raw;
  soulUnlockData: Raw[];
  /** deadlock-data の localizations/japanese.json */
  japanese: Record<string, string>;
  heroesVdata: Kv3Object;
  abilitiesVdata: Kv3Object;
  gameVersion: number;
  vdataVersion: number;
}

const ENGINE_UNITS_PER_METER = 1 / 0.0254;

const ITEM_SLOTS: Record<string, ItemSlot> = {
  Weapon: 'weapon',
  Armor: 'vitality',
  Tech: 'spirit',
};

// deadlock-data 側で計算済みの表示用値。生データではないので捨てる
const DERIVED_SCALING_KEYS = new Set(['DPS', 'SustainedDPS', 'PowerIncreases']);

export function buildGameData(input: RawInputs): GameData {
  const warnings: string[] = [];
  if (input.gameVersion !== input.vdataVersion) {
    warnings.push(
      `deadlock-data (build ${input.gameVersion}) と vdata (build ${input.vdataVersion}) のビルドが一致しない`,
    );
  }

  const heroes: Record<string, Hero> = {};
  const abilities: Record<string, Ability> = {};

  for (const key of Object.keys(input.heroData).sort()) {
    const raw = input.heroData[key];
    if (!raw.IsSelectable || raw.IsDisabled || raw.InDevelopment) continue;

    const hero = buildHero(key, raw, input, warnings);
    heroes[key] = hero;

    for (const abilityKey of hero.abilities) {
      // 変身前後など複数ヒーローが共有するアビリティは最初のヒーローに紐付ける
      if (abilities[abilityKey]) continue;
      const rawAbility = input.abilityData[abilityKey];
      if (!rawAbility) {
        warnings.push(`${key}: アビリティ ${abilityKey} が ability-data に無い`);
        continue;
      }
      abilities[abilityKey] = buildAbility(abilityKey, key, rawAbility, input.japanese);
    }
  }

  const items: Record<string, Item> = {};
  for (const key of Object.keys(input.itemData).sort()) {
    const raw = input.itemData[key];
    const slot = ITEM_SLOTS[raw.Slot];
    if (raw.IsDisabled || !slot || typeof raw.Tier !== 'number') continue;
    items[key] = buildItem(key, slot, raw, input.japanese);
  }

  const soulUnlocks: SoulUnlock[] = input.soulUnlockData
    .map((u) => ({
      souls: u.RequiredSouls ?? 0,
      powerIncrease: u.PowerIncrease === true,
      abilityPoints: u.AbilityPoints ?? 0,
      abilityUnlocks: u.AbilityUnlocks ?? 0,
    }))
    .sort((a, b) => a.souls - b.souls);

  return {
    meta: { gameVersion: input.gameVersion, vdataVersion: input.vdataVersion, warnings },
    heroes,
    abilities,
    items,
    soulUnlocks,
  };
}

function buildHero(key: string, raw: Raw, input: RawInputs, warnings: string[]): Hero {
  const vdataHero = input.heroesVdata[key];
  const bound = isObject(vdataHero) ? vdataHero.m_mapBoundAbilities : undefined;

  // deadlock-data の Weapon.NameKey は vdata のキーと違うことがあるので、
  // ヘッドショット倍率は heroes.vdata の実際の武器スロットから引く
  let primaryKey: string | undefined;
  if (isObject(bound) && typeof bound.ESlot_Weapon_Primary === 'string') {
    primaryKey = bound.ESlot_Weapon_Primary;
  }

  const weapon = raw.Weapon ? buildWeapon(raw.Weapon, primaryKey, input.abilitiesVdata) : null;
  const altFire = raw.Weapon?.AltFire
    ? buildWeapon(raw.Weapon.AltFire, raw.Weapon.AltFire.NameKey, input.abilitiesVdata)
    : null;
  if (weapon && !weapon.crit) warnings.push(`${key}: 武器のヘッドショット倍率が vdata から取れない`);
  if (altFire && !altFire.crit) warnings.push(`${key}: 副射撃のヘッドショット倍率が vdata から取れない`);

  const abilities = ['1', '2', '3', '4']
    .map((slot) => raw.BoundAbilities?.[slot]?.Key)
    .filter((k): k is string => typeof k === 'string');

  const stats: HeroStats = {
    maxHealth: num(raw.MaxHealth),
    baseHealthRegen: num(raw.BaseHealthRegen),
    bulletResist: num(raw.BulletResist),
    spiritResist: num(raw.TechResist),
    meleeResist: num(raw.MeleeResist),
    critDamageBonusPercent: num(raw.CritDamageBonusPercent),
    critDamageReceivedPercent: num(raw.CritDamageReceivedPercent),
    lightMeleeDamage: num(raw.LightMeleeDamage),
    heavyMeleeDamage: num(raw.HeavyMeleeDamage),
    bulletLifesteal: num(raw.BulletLifesteal),
    maxMoveSpeed: num(raw.MaxMoveSpeed),
    sprintSpeed: num(raw.SprintSpeed),
  };

  const heroId = isObject(vdataHero) && typeof vdataHero.m_HeroID === 'number' ? vdataHero.m_HeroID : null;

  return {
    key,
    id: heroId,
    name: localized(key, raw.Name, input.japanese),
    type: typeof raw.Type === 'string' ? raw.Type : null,
    stats,
    levelScaling: numericRecord(raw.LevelScaling),
    spiritScaling: numericRecord(raw.SpiritScaling),
    weapon,
    altFire,
    abilities,
  };
}

function buildWeapon(raw: Raw, vdataKey: string | undefined, abilitiesVdata: Kv3Object): Weapon {
  const spin =
    typeof raw.RoundsPerSecondAtMaxSpin === 'number'
      ? {
          roundsPerSecondAtMaxSpin: raw.RoundsPerSecondAtMaxSpin,
          acceleration: num(raw.SpinAcceleration),
          deceleration: num(raw.SpinDeceleration),
        }
      : null;
  const explosion =
    typeof raw.ExplosionRadius === 'number'
      ? { radius: raw.ExplosionRadius, damageScaleAtMaxRadius: num(raw.ExplosionDamageScaleAtMaxRadius, 1) }
      : null;

  return {
    key: vdataKey ?? raw.NameKey ?? '',
    bulletDamage: num(raw.BulletDamage),
    bulletsPerShot: num(raw.BulletsPerShot, 1),
    roundsPerSecond: num(raw.RoundsPerSecond),
    bulletsPerBurst: num(raw.BulletsPerBurst, 1),
    burstInterShotInterval: num(raw.BurstInterShotInterval),
    clipSize: num(raw.ClipSize),
    ammoPerShot: num(raw.AmmoConsumedPerShot, 1),
    reloadTime: num(raw.ReloadTime),
    reloadSingle: raw.ReloadSingle === true,
    reloadDelay: num(raw.ReloadDelay),
    falloff: {
      startRange: num(raw.FalloffStartRange),
      endRange: num(raw.FalloffEndRange),
      startScale: num(raw.FalloffStartScale, 1),
      endScale: num(raw.FalloffEndScale, 1),
      bias: num(raw.FalloffBias, 0.5),
    },
    crit: vdataKey ? readCrit(vdataKey, raw.CanCrit !== false, abilitiesVdata) : null,
    spin,
    explosion,
    hitOnceAcrossAllBullets: raw.HitOnceAcrossAllBullets === true,
    weaponTypes: Array.isArray(raw.WeaponTypes) ? raw.WeaponTypes : [],
    reference: { dps: num(raw.DPS), sustainedDps: num(raw.SustainedDPS) },
  };
}

function readCrit(weaponKey: string, canCrit: boolean, abilitiesVdata: Kv3Object): Crit | null {
  const field = (name: string) => lookupWeaponInfo(weaponKey, name, abilitiesVdata);
  const bonusStart = field('m_flCritBonusStart');
  const bonusEnd = field('m_flCritBonusEnd');
  if (typeof bonusStart !== 'number' || typeof bonusEnd !== 'number') return null;
  return {
    canCrit,
    bonusStart,
    bonusEnd,
    startRange: toMeters(num(field('m_flCritBonusStartRange'))),
    endRange: toMeters(num(field('m_flCritBonusEndRange'))),
    againstNpcs: num(field('m_flCritBonusAgainstNPCs')),
  };
}

/** m_mapWeaponInfos.primary の値を、無ければ _base / _multibase の継承元から探す */
function lookupWeaponInfo(
  key: string,
  field: string,
  abilitiesVdata: Kv3Object,
  seen: Set<string> = new Set(),
): Kv3Value | undefined {
  if (seen.has(key)) return undefined;
  seen.add(key);
  const entry = abilitiesVdata[key];
  if (!isObject(entry)) return undefined;

  const infos = entry.m_mapWeaponInfos;
  if (isObject(infos) && isObject(infos.primary) && field in infos.primary) {
    return infos.primary[field];
  }
  for (const base of [entry._base, entry._multibase].flat()) {
    if (typeof base !== 'string') continue;
    const found = lookupWeaponInfo(base, field, abilitiesVdata, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function buildAbility(key: string, heroKey: string, raw: Raw, japanese: Record<string, string>): Ability {
  return {
    key,
    name: localized(key, raw.Name, japanese),
    hero: heroKey,
    props: normalizeProps(raw),
    upgrades: Array.isArray(raw.Upgrades) ? raw.Upgrades.map((u: Raw) => normalizeProps(u)) : [],
  };
}

const ITEM_META_KEYS = new Set(['Cost', 'Tier', 'MaxLevel']);

function buildItem(key: string, slot: ItemSlot, raw: Raw, japanese: Record<string, string>): Item {
  return {
    key,
    name: localized(key, raw.Name, japanese),
    slot,
    tier: raw.Tier,
    cost: num(raw.Cost),
    activation: typeof raw.Activation === 'string' ? raw.Activation : 'Passive',
    components: Array.isArray(raw.Components) ? raw.Components : [],
    isImbue: raw.IsImbue === true,
    streetBrawl: raw.StreetBrawl === true,
    props: normalizeProps(raw, ITEM_META_KEYS),
    upgradeBonus: raw.PropertyUpgrades ? normalizeProps(raw.PropertyUpgrades) : null,
    corruptedBonus: raw.CorruptedUpgrades ? normalizeProps(raw.CorruptedUpgrades) : null,
  };
}

/**
 * 数値と「基礎値 + スケーリング」の値だけを残す。
 * モディファイア定義・フラグ配列・文字列などは計算に使わないので落とす。
 */
export function normalizeProps(raw: Raw, exclude: Set<string> = new Set()): PropMap {
  const out: PropMap = {};
  for (const key of Object.keys(raw).sort()) {
    if (exclude.has(key)) continue;
    const value = normalizePropValue(raw[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function normalizePropValue(v: unknown): PropValue | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Raw;
  if (typeof o.Value !== 'number' || (!('Scale' in o) && !o.Multiply)) return undefined;

  const scale: Scale[] = [];
  for (const s of [o.Scale ?? []].flat()) {
    if (!s || typeof s.Value !== 'number' || typeof s.Type !== 'string') continue;
    scale.push(s.Multiply ? { type: s.Type, value: s.Value, multiply: true } : { type: s.Type, value: s.Value });
  }
  return o.Multiply ? { value: o.Value, scale, multiply: true } : { value: o.Value, scale };
}

function localized(key: string, en: unknown, japanese: Record<string, string>): LocalizedText {
  const name: LocalizedText = { en: typeof en === 'string' && en ? en : key };
  const ja = japanese[key];
  if (ja) name.ja = ja;
  return name;
}

function numericRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!DERIVED_SCALING_KEYS.has(k) && typeof v === 'number') out[k] = v;
  }
  return out;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** deadbot と同じく有効数字4桁 */
function toMeters(engineUnits: number): number {
  return Number((engineUnits / ENGINE_UNITS_PER_METER).toPrecision(4));
}
