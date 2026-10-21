import type { AbilityResult } from '../calc/abilities.ts';
import type { Modifier, StatKey, Stats } from '../calc/stats.ts';
import type { WeaponResult } from '../calc/weapon.ts';
import { fmt, t } from './format.ts';
import { AbilityIcon, HeroIcon } from './Icon.tsx';

interface Props {
  me: Stats;
  enemy: Stats;
  weapon: WeaponResult | null;
  abilities: AbilityResult[];
  headshotRate: number;
}

const STAT_LABEL: Record<StatKey, string> = {
  spiritPower: 'スピリットパワー',
  spiritPowerPct: 'スピリットパワー %',
  weaponDamagePct: '武器ダメージ %',
  fireRatePct: '連射速度 %',
  clipPct: '弾倉 %',
  clipFlat: '弾倉 +',
  reloadTimePct: 'リロード時間 %',
  bulletResist: '弾耐性 %',
  spiritResist: 'スピリット耐性 %',
  maxHealth: '最大HP +',
  baseHealthPct: '基礎HP %',
  spiritDamagePct: 'スピリットダメージ %',
  allDamagePct: '与ダメージ %',
  cooldownReductionPct: 'クールダウン短縮 %',
  enemyBulletResist: '敵の弾耐性 %',
  enemySpiritResist: '敵のスピリット耐性 %',
};

export function Results({ me, enemy, weapon, abilities, headshotRate }: Props) {
  if (!weapon) return <section className="panel">武器データがありません</section>;

  const totalDps = weapon.sustainedDps + weapon.procDps;
  const abilityBurst = abilities.reduce((n, a) => n + a.totalPerCast, 0);
  const hp = enemy.maxHealth;
  const remaining = Math.max(0, hp - abilityBurst);
  const comboTime = remaining / Math.max(totalDps, 0.0001);
  const clipPct = Math.min(100, (weapon.clipDamage / hp) * 100);
  const abilityPct = Math.min(100, (abilityBurst / hp) * 100);

  return (
    <div className="results">
      <section className="panel matchup">
        <div className="matchup-side">
          <HeroIcon heroKey={me.hero.key} name={t(me.hero.name)} size={52} />
          <span>{t(me.hero.name)}</span>
        </div>
        <span className="vs">VS</span>
        <div className="matchup-side">
          <HeroIcon heroKey={enemy.hero.key} name={t(enemy.hero.name)} size={52} />
          <span>{t(enemy.hero.name)}</span>
        </div>
      </section>

      <section className="kpis">
        <Kpi label="武器DPS (リロード込み)" value={fmt(totalDps, 0)} accent hint={weapon.procDps > 0 ? `うちアイテム追加 ${fmt(weapon.procDps, 1)}` : undefined} />
        <Kpi label="武器DPS (撃ちっぱなし)" value={fmt(weapon.burstDps + weapon.procDps, 0)} />
        <Kpi label="キルタイム (武器のみ)" value={`${fmt(weapon.timeToKill, 2)}秒`} hint={`${weapon.shotsToKill} 発`} />
        <Kpi label="キルタイム (スキル込み)" value={abilityBurst >= hp ? 'スキルで倒せる' : `${fmt(comboTime, 2)}秒`} hint={`スキル合計 ${fmt(abilityBurst, 0)}`} />
        <Kpi label="ヘッドショット倍率" value={`×${fmt(weapon.headshotMultiplier, 2)}`} hint={`HS率 ${headshotRate}%`} />
        <Kpi label="敵の実効弾耐性" value={`${fmt(weapon.targetResist, 1)}%`} />
      </section>

      <section className="panel">
        <h2>敵のHPに対して</h2>
        <Bar label="弾倉1つのダメージ" pct={clipPct} value={`${fmt(weapon.clipDamage, 0)} / ${fmt(hp, 0)}`} kind="weapon" />
        <Bar label="スキルを1回ずつ当てたダメージ" pct={abilityPct} value={`${fmt(abilityBurst, 0)} / ${fmt(hp, 0)}`} kind="spirit" />
      </section>

      <section className="panel">
        <h2>武器</h2>
        <div className="detail-grid">
          <Detail label="1発 (胴)" value={fmt(weapon.bodyDamage, 2)} />
          <Detail label="1発 (頭)" value={fmt(weapon.headDamage, 2)} />
          <Detail label="1回の射撃の弾数" value={`${weapon.bulletsPerShot}`} />
          <Detail label="連射 (回/秒)" value={fmt(weapon.roundsPerSecond, 2)} />
          <Detail label="装弾数" value={`${weapon.clipSize}`} />
          <Detail label="リロード" value={`${fmt(weapon.reloadTime, 2)}秒`} />
          <Detail label="距離による減衰" value={`${fmt(weapon.falloff * 100, 0)}%`} />
          <Detail label="弾倉1つのダメージ" value={fmt(weapon.clipDamage, 0)} />
        </div>
        <p className="formula muted small">
          1発 = ({fmt(weapon.breakdown.baseBullet, 2)} 基礎 + {fmt(weapon.breakdown.levelBonus, 2)} レベル
          {weapon.breakdown.spiritBonus ? ` + ${fmt(weapon.breakdown.spiritBonus, 2)} スピリット` : ''}) × 武器ダメージ +
          {fmt(weapon.breakdown.weaponDamagePct, 0)}%
          {weapon.breakdown.allDamagePct ? ` × 与ダメージ +${fmt(weapon.breakdown.allDamagePct, 0)}%` : ''} × 減衰{' '}
          {fmt(weapon.falloff * 100, 0)}% × (1 − 耐性 {fmt(weapon.targetResist, 1)}%)
        </p>
      </section>

      <section className="panel">
        <h2>スキルのダメージ</h2>
        <div className="ability-results">
          {abilities.map((a) => (
            <div key={a.ability.key} className="ability-result">
              <AbilityIcon abilityKey={a.ability.key} name={t(a.ability.name)} size={44} />
              <div className="ability-result-main">
                <div className="ability-name">
                  {t(a.ability.name)} <span className="muted small">T{a.tier}{a.cooldown > 0 ? ` ・ CD ${fmt(a.cooldown, 1)}秒` : ''}</span>
                </div>
                {a.lines.length === 0 ? (
                  <div className="muted small">ダメージなし (または計算対象外)</div>
                ) : (
                  <ul className="damage-lines">
                    {a.lines.map((l) => (
                      <li key={l.key}>
                        <span>{t(l.label)}</span>
                        <span className="value">
                          {l.percent ? `${fmt(l.raw, 2)}%` : fmt(l.dealt, 1)}
                          {l.perSecond ? ' /秒' : ''}
                          {!l.percent && l.dealt !== l.raw && <span className="muted small"> (耐性前 {fmt(l.raw, 1)})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <details className="panel breakdown">
        <summary>計算に使った補正の一覧</summary>
        <div className="breakdown-cols">
          <ModifierList title={`自分 (${t(me.hero.name)})`} mods={[...me.modifiers, ...me.enemyModifiers]} />
          <ModifierList title={`敵 (${t(enemy.hero.name)})`} mods={[...enemy.modifiers, ...enemy.enemyModifiers]} />
        </div>
      </details>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`kpi${accent ? ' accent' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

function Bar({ label, pct, value, kind }: { label: string; pct: number; value: string; kind: 'weapon' | 'spirit' }) {
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{label}</span>
        <span className="muted small">
          {value} ({fmt(pct, 0)}%)
        </span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${kind}`} style={{ width: `${Math.max(0, pct)}%` }} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <div className="muted small">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

function ModifierList({ title, mods }: { title: string; mods: Modifier[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {mods.length === 0 ? (
        <p className="muted small">なし</p>
      ) : (
        <ul className="modifier-list">
          {mods.map((m, i) => (
            <li key={i}>
              <span>{STAT_LABEL[m.stat]}</span>
              <span className="value">{fmt(m.value, 1)}</span>
              <span className="muted small">{t(m.source.label)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
