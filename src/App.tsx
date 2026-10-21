import { useMemo, useState } from 'react';
import { headshotMultiplier } from './calc/headshot.ts';
import { gameData } from './data/index.ts';
import type { Hero } from './types/game-data.ts';

const heroes = Object.values(gameData.heroes)
  .filter((h) => h.weapon)
  .sort((a, b) => heroName(a).localeCompare(heroName(b), 'ja'));

function heroName(hero: Hero): string {
  return hero.name.ja ?? hero.name.en;
}

export function App() {
  const [attackerKey, setAttackerKey] = useState('hero_haze');
  const [targetKey, setTargetKey] = useState('hero_haze');
  const attacker = gameData.heroes[attackerKey]!;
  const target = gameData.heroes[targetKey]!;
  const weapon = attacker.weapon!;

  const multiplier = useMemo(
    () => headshotMultiplier({ weaponCrit: weapon.crit, attacker: attacker.stats, target: target.stats }),
    [weapon, attacker, target],
  );

  return (
    <main>
      <header>
        <h1>Deadlock DPS Checker</h1>
        <p className="muted">開発中 / ゲームビルド {gameData.meta.gameVersion}</p>
      </header>

      <section className="pickers">
        <HeroSelect label="自分" value={attackerKey} onChange={setAttackerKey} />
        <HeroSelect label="敵" value={targetKey} onChange={setTargetKey} />
      </section>

      <section className="cards">
        <Stat label="1発のダメージ" value={fmt(weapon.bulletDamage * weapon.bulletsPerShot)} />
        <Stat label="連射 (発/秒)" value={fmt(weapon.roundsPerSecond)} />
        <Stat label="装弾数" value={String(weapon.clipSize)} />
        <Stat label="リロード (秒)" value={fmt(weapon.reloadTime)} />
        <Stat label="ヘッドショット倍率" value={`×${fmt(multiplier, 3)}`} />
        <Stat label="基礎DPS (胴)" value={fmt(weapon.reference.dps)} />
        <Stat label="基礎DPS (頭)" value={fmt(weapon.reference.dps * multiplier)} />
      </section>

      <p className="muted small">
        レベル1・アイテムなし・減衰なしの値。アイテムやスキル、耐性を含めた計算は実装中。
      </p>
    </main>
  );
}

function HeroSelect({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  return (
    <label className="picker">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {heroes.map((h) => (
          <option key={h.key} value={h.key}>
            {heroName(h)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function fmt(n: number, digits = 2): string {
  return Number(n.toFixed(digits)).toString();
}
