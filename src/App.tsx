import { useEffect, useMemo, useState } from 'react';
import { abilityResults } from './calc/abilities.ts';
import { computeStats } from './calc/stats.ts';
import { weaponDps } from './calc/weapon.ts';
import { gameData } from './data/index.ts';
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from './state.ts';
import { BuildPanel } from './ui/BuildPanel.tsx';
import { fmt } from './ui/format.ts';
import { Results } from './ui/Results.tsx';

function initialState(): AppState {
  return decodeState(window.location.hash) ?? DEFAULT_STATE;
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [copied, setCopied] = useState(false);
  const update = (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch }));

  useEffect(() => {
    window.history.replaceState(null, '', `#s=${encodeState(state)}`);
  }, [state]);

  const me = useMemo(() => computeStats(gameData, state.me), [state.me]);
  const enemy = useMemo(() => computeStats(gameData, state.enemy), [state.enemy]);
  const hasAlt = !!me.hero.altFire;
  const weapon = useMemo(
    () =>
      weaponDps(gameData, me, enemy, {
        distance: state.distance,
        headshotRate: state.headshotRate / 100,
        altFire: hasAlt && state.altFire,
      }),
    [me, enemy, state.distance, state.headshotRate, state.altFire, hasAlt],
  );
  const abilities = useMemo(() => abilityResults(gameData, me, enemy, state.me.abilityTiers), [me, enemy, state.me.abilityTiers]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('このURLをコピーしてください', window.location.href);
    }
  };

  return (
    <>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">DL</span>
          <div>
            <h1>Deadlock DPS Checker</h1>
            <p className="muted small">ゲームビルド {gameData.meta.gameVersion} のデータで計算</p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={() => setState(DEFAULT_STATE)}>
            リセット
          </button>
          <button type="button" className="primary" onClick={share}>
            {copied ? 'コピーしました' : 'この構成を共有'}
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="builds">
          <BuildPanel side="me" build={state.me} stats={me} other={enemy} onChange={(b) => update({ me: b })} />
          <BuildPanel side="enemy" build={state.enemy} stats={enemy} other={me} onChange={(b) => update({ enemy: b })} />
        </div>

        <section className="panel conditions" aria-label="条件">
          <div className="field">
            <label className="field-label" htmlFor="distance">
              敵との距離 <strong>{state.distance} m</strong>
            </label>
            <input id="distance" type="range" min={0} max={60} step={1} value={state.distance} onChange={(e) => update({ distance: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="hs">
              ヘッドショット率 <strong>{state.headshotRate}%</strong>
            </label>
            <input id="hs" type="range" min={0} max={100} step={5} value={state.headshotRate} onChange={(e) => update({ headshotRate: Number(e.target.value) })} />
          </div>
          {hasAlt && (
            <label className="checkbox">
              <input type="checkbox" checked={state.altFire} onChange={(e) => update({ altFire: e.target.checked })} />
              副射撃で計算する
            </label>
          )}
        </section>

        <div id="results">
          <Results me={me} enemy={enemy} weapon={weapon} abilities={abilities} headshotRate={state.headshotRate} />
        </div>

        <section className="panel notes">
          <h2>計算について</h2>
          <ul>
            <li>データは Deadlock Wiki (deadlock-data) とゲームファイル (SteamDB の GameTracking) から取得しています。アイコンは deadlock-open-assets のものです。</li>
            <li>1発のダメージ = (基礎 + レベル成長) × (1 + 武器ダメージ%) × 距離減衰 × (1 − 耐性) × ヘッドショット倍率。</li>
            <li>耐性は複数あると掛け算で重なる (30% + 30% → 51%) 、耐性低下も同じ式で入るとして計算しています。</li>
            <li>アイテムの「常時」効果は自動で入ります。発動・命中時などの条件付き効果は「効果ON」にしたものだけ入ります。</li>
            <li>スキルはスピリットダメージ (tech_damage) の値を表示しています。持続ダメージや特殊な仕組みは正確でない場合があります。</li>
            <li>回転で連射が上がる武器は最大回転時、リロードは弾倉を撃ち切ってからとして計算しています。</li>
          </ul>
        </section>
      </main>

      {weapon && (
        <a className="sticky-summary" href="#results" onClick={(e) => {
          e.preventDefault();
          document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' });
        }}>
          <span>
            武器DPS <strong>{fmt(weapon.sustainedDps + weapon.procDps, 0)}</strong>
          </span>
          <span>
            キル <strong>{fmt(weapon.timeToKill, 1)}秒</strong>
          </span>
          <span className="muted">結果へ ↓</span>
        </a>
      )}

      <footer className="site-footer muted small">
        非公式のファンツールです。Deadlock は Valve Corporation の商標です。
      </footer>
    </>
  );
}
