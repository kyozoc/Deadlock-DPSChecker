import icons from '../data/icons.json';
import type { ItemSlot } from '../types/game-data.ts';

const BASE = import.meta.env.BASE_URL;
const available = {
  heroes: new Set(icons.heroes),
  heroCards: new Set(icons.heroCards),
  items: new Set(icons.items),
  abilities: new Set(icons.abilities),
};

function initials(name: string): string {
  return name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2);
}

export function HeroIcon({ heroKey, name, size = 40 }: { heroKey: string; name: string; size?: number }) {
  return available.heroes.has(heroKey) ? (
    <img className="hero-icon" src={`${BASE}icons/heroes/${heroKey}.webp`} alt={name} width={size} height={size} />
  ) : (
    <span className="hero-icon fallback" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-label={name}>
      {initials(name)}
    </span>
  );
}

export function HeroCard({ heroKey, name }: { heroKey: string; name: string }) {
  return available.heroCards.has(heroKey) ? (
    <img className="hero-card" src={`${BASE}icons/hero-cards/${heroKey}.webp`} alt={name} />
  ) : (
    <span className="hero-card fallback" aria-label={name}>
      {initials(name)}
    </span>
  );
}

export function ItemIcon({ itemKey, slot, name, size = 44 }: { itemKey: string; slot: ItemSlot; name: string; size?: number }) {
  return (
    <span className={`item-icon slot-${slot}`} style={{ width: size, height: size }}>
      {available.items.has(itemKey) ? (
        <img src={`${BASE}icons/items/${itemKey}.webp`} alt={name} loading="lazy" />
      ) : (
        <span className="fallback-text">{initials(name)}</span>
      )}
    </span>
  );
}

export function AbilityIcon({ abilityKey, name, size = 44 }: { abilityKey: string; name: string; size?: number }) {
  return (
    <span className="ability-icon" style={{ width: size, height: size }}>
      {available.abilities.has(abilityKey) ? (
        <img src={`${BASE}icons/abilities/${abilityKey}.webp`} alt={name} loading="lazy" />
      ) : (
        <span className="fallback-text">{initials(name)}</span>
      )}
    </span>
  );
}
