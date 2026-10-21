import { useState } from 'react';
import type { Build, Stats } from '../calc/stats.ts';
import { effectiveResist } from '../calc/stats.ts';
import { PROP_EFFECTS } from '../calc/stats.ts';
import { applyUpgrades } from '../calc/values.ts';
import { gameData } from '../data/index.ts';
import { emptyBuild, MAX_ITEMS, MAX_SOULS } from '../state.ts';
import type { Item } from '../types/game-data.ts';
import { fmt, formatProp, t } from './format.ts';
import { HeroPicker } from './HeroPicker.tsx';
import { AbilityIcon, HeroCard, ItemIcon } from './Icon.tsx';
import { ItemDetail, ItemShop, SLOT_NAMES } from './ItemShop.tsx';
import { Modal } from './Modal.tsx';

interface Props {
  side: 'me' | 'enemy';
  build: Build;
  stats: Stats;
  /** 相手側 (耐性の実効値の表示用) */
  other: Stats;
  onChange: (build: Build) => void;
}

const SOUL_MARKS = [0, 5000, 10000, 20000, 30000, 40000, 50000];

function hasConditional(item: Item): boolean {
  return item.sections.some((s) => s.props.some((p) => p.usage !== 'always' && item.props[p.key] !== undefined));
}

export function BuildPanel({ side, build, stats, other, onChange }: Props) {
  const [picking, setPicking] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [inspect, setInspect] = useState<Item | null>(null);
  const hero = stats.hero;
  const title = side === 'me' ? '自分' : '敵';

  const set = (patch: Partial<Build>) => onChange({ ...build, ...patch });
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const toggleNum = (list: number[], n: number) => (list.includes(n) ? list.filter((k) => k !== n) : [...list, n]);

  const items = build.items.map((k) => gameData.items[k]).filter((i): i is Item => !!i);
  const spentSouls = items.reduce((n, i) => n + i.cost, 0);
  const usedPoints = build.abilityTiers.reduce((n, tier) => n + [0, 1, 3, 8][tier]!, 0);

  return (
    <section className={`panel build-panel side-${side}`} aria-label={`${title}の構成`}>
      <div className="panel-title">
        <span className="side-badge">{title}</span>
      </div>

      <button type="button" className="hero-header" onClick={() => setPicking(true)}>
        <HeroCard heroKey={hero.key} name={t(hero.name)} />
        <div className="hero-header-text">
          <div className="hero-name">{t(hero.name)}</div>
          <div className="muted small">{hero.name.en}</div>
          <div className="change-hint">タップしてヒーローを変更</div>
        </div>
      </button>

      <div className="field">
        <label className="field-label" htmlFor={`souls-${side}`}>
          ソウル <strong>{fmt(build.souls, 0)}</strong>
          <span className="muted small">
            {' '}
            ブーン {stats.boons} ・ スキルポイント {stats.abilityPoints}
          </span>
        </label>
        <input
          id={`souls-${side}`}
          type="range"
          min={0}
          max={MAX_SOULS}
          step={100}
          value={build.souls}
          onChange={(e) => set({ souls: Number(e.target.value) })}
        />
        <div className="soul-marks">
          {SOUL_MARKS.map((m) => (
            <button key={m} type="button" className="chip" onClick={() => set({ souls: m })}>
              {m === 0 ? '0' : `${m / 1000}k`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          アイテム <span className="muted small">{items.length}/{MAX_ITEMS} ・ {fmt(spentSouls, 0)} ソウル</span>
        </div>
        <div className="item-slots">
          {items.map((item) => {
            const cond = hasConditional(item);
            const on = build.activeItems.includes(item.key);
            return (
              <div key={item.key} className={`item-slot${on ? ' on' : ''}`}>
                <button type="button" className="item-slot-main" onClick={() => setInspect(item)} title={t(item.name)}>
                  <ItemIcon itemKey={item.key} slot={item.slot} name={t(item.name)} size={46} />
                  <span className="item-slot-name">{t(item.name)}</span>
                </button>
                {cond && (
                  <button
                    type="button"
                    className={`effect-toggle${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => set({ activeItems: toggle(build.activeItems, item.key) })}
                    title="条件付きの効果 (発動・命中時など) を計算に入れる"
                  >
                    {on ? '効果ON' : '効果OFF'}
                  </button>
                )}
              </div>
            );
          })}
          {items.length < MAX_ITEMS && (
            <button type="button" className="item-slot add" onClick={() => setShopping(true)}>
              <span className="plus">＋</span>
              <span className="item-slot-name">追加</span>
            </button>
          )}
        </div>
        {items.length > 0 && (
          <div className="investment muted small">
            {(['weapon', 'vitality', 'spirit'] as const).map((s) =>
              stats.investment[s].souls > 0 ? (
                <span key={s} className={`invest slot-${s}`}>
                  {SLOT_NAMES[s]} {fmt(stats.investment[s].souls, 0)}
                  {stats.investment[s].bonus > 0 && ` (${s === 'spirit' ? '+' : '+'}${stats.investment[s].bonus}${s === 'spirit' ? ' スピリット' : '%'})`}
                </span>
              ) : null,
            )}
          </div>
        )}
      </div>

      <div className="field">
        <div className="field-label">
          スキル{' '}
          <span
            className={`muted small${usedPoints > stats.abilityPoints ? ' warn' : ''}`}
            title="強化コストは T1=1, T2=2, T3=5 ポイントとして数えた目安"
          >
            強化 {usedPoints}/{stats.abilityPoints} ポイント (目安)
          </span>
        </div>
        <div className="ability-list">
          {hero.abilities.map((key, index) => {
            const ability = gameData.abilities[key];
            if (!ability) return null;
            const tier = build.abilityTiers[index] ?? 0;
            const props = applyUpgrades(ability.props, ability.upgrades, tier);
            const effects = Object.keys(props).filter((p) => p in PROP_EFFECTS);
            const on = build.activeAbilities.includes(index);
            return (
              <div key={key} className="ability-row">
                <AbilityIcon abilityKey={key} name={t(ability.name)} size={40} />
                <div className="ability-main">
                  <div className="ability-name">{t(ability.name)}</div>
                  <div className="tier-pips" role="group" aria-label={`${t(ability.name)} の強化段階`}>
                    {[0, 1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`pip${tier >= n && n > 0 ? ' filled' : ''}${tier === n ? ' current' : ''}`}
                        onClick={() => {
                          const tiers = [...build.abilityTiers];
                          tiers[index] = n;
                          set({ abilityTiers: tiers });
                        }}
                        aria-label={n === 0 ? '強化なし' : `T${n}`}
                        title={n === 0 ? '強化なし' : `T${n}`}
                      >
                        {n === 0 ? '0' : n}
                      </button>
                    ))}
                  </div>
                </div>
                {effects.length > 0 && (
                  <button
                    type="button"
                    className={`effect-toggle${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => set({ activeAbilities: toggleNum(build.activeAbilities, index) })}
                    title={effects.map((p) => `${t(gameData.labels[p]) || p} ${formatProp(p, props[p])}`).join('\n')}
                  >
                    {on ? '効果ON' : '効果OFF'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <dl className="mini-stats">
        <div>
          <dt>最大HP</dt>
          <dd>{fmt(stats.maxHealth, 0)}</dd>
        </div>
        <div>
          <dt>スピリットパワー</dt>
          <dd>{fmt(stats.spiritPower, 1)}</dd>
        </div>
        <div>
          <dt>武器ダメージ</dt>
          <dd>+{fmt(stats.sum('weaponDamagePct'), 0)}%</dd>
        </div>
        <div>
          <dt>連射速度</dt>
          <dd>+{fmt(stats.sum('fireRatePct'), 0)}%</dd>
        </div>
        <div>
          <dt>弾耐性{side === 'enemy' ? ' (実効)' : ''}</dt>
          <dd>{fmt(side === 'enemy' ? effectiveResist(stats, other, 'bullet') : effectiveResist(stats, emptyStatsLike(stats), 'bullet'), 1)}%</dd>
        </div>
        <div>
          <dt>スピリット耐性{side === 'enemy' ? ' (実効)' : ''}</dt>
          <dd>{fmt(side === 'enemy' ? effectiveResist(stats, other, 'spirit') : effectiveResist(stats, emptyStatsLike(stats), 'spirit'), 1)}%</dd>
        </div>
      </dl>

      {picking && (
        <HeroPicker
          current={hero.key}
          onPick={(key) => onChange({ ...emptyBuild(key, build.souls), items: build.items, activeItems: build.activeItems })}
          onClose={() => setPicking(false)}
        />
      )}
      {shopping && (
        <ItemShop
          owned={build.items}
          full={build.items.length >= MAX_ITEMS}
          onAdd={(key) => set({ items: [...build.items, key] })}
          onClose={() => setShopping(false)}
        />
      )}
      {inspect && (
        <Modal title={t(inspect.name)} onClose={() => setInspect(null)}>
          <ItemDetail item={inspect} />
          <div className="modal-actions">
            {hasConditional(inspect) && (
              <button
                type="button"
                className={`effect-toggle big${build.activeItems.includes(inspect.key) ? ' on' : ''}`}
                onClick={() => set({ activeItems: toggle(build.activeItems, inspect.key) })}
              >
                条件付きの効果: {build.activeItems.includes(inspect.key) ? 'ON' : 'OFF'}
              </button>
            )}
            <button
              type="button"
              className="danger"
              onClick={() => {
                set({ items: build.items.filter((k) => k !== inspect.key), activeItems: build.activeItems.filter((k) => k !== inspect.key) });
                setInspect(null);
              }}
            >
              このアイテムを外す
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** 耐性低下を持たない相手 (自分側の素の耐性表示用) */
function emptyStatsLike(stats: Stats): Stats {
  return { ...stats, enemyModifiers: [] };
}
