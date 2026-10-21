import { useMemo, useState } from 'react';
import { gameData } from '../data/index.ts';
import type { Item, ItemSlot } from '../types/game-data.ts';
import { fmt, formatProp, t } from './format.ts';
import { ItemIcon } from './Icon.tsx';
import { Modal } from './Modal.tsx';

export const SLOT_NAMES: Record<ItemSlot, string> = { weapon: 'ウェポン', vitality: 'バイタリティ', spirit: 'スピリット' };
const SLOTS: ItemSlot[] = ['weapon', 'vitality', 'spirit'];
const items = Object.values(gameData.items).sort((a, b) => a.tier - b.tier || a.cost - b.cost || t(a.name).localeCompare(t(b.name), 'ja'));

export function ItemShop({
  owned,
  full,
  onAdd,
  onClose,
}: {
  owned: string[];
  full: boolean;
  onAdd: (key: string) => void;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState<ItemSlot>('weapon');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) =>
      q ? `${i.name.ja ?? ''} ${i.name.en}`.toLowerCase().includes(q) : i.slot === slot,
    );
  }, [slot, query]);
  const tiers = [...new Set(list.map((i) => i.tier))];

  return (
    <Modal title="アイテムを追加" onClose={onClose}>
      <div className="shop-controls">
        <div className="tabs" role="tablist">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={!query && slot === s}
              className={`tab slot-${s}${!query && slot === s ? ' active' : ''}`}
              onClick={() => {
                setSlot(s);
                setQuery('');
              }}
            >
              {SLOT_NAMES[s]}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="アイテム名で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {full && <p className="notice">アイテム枠がいっぱいです。外してから追加してください。</p>}
      <div className="shop-layout">
        <div className="shop-list">
          {tiers.map((tier) => (
            <section key={tier} className="shop-tier">
              <h3>
                Tier {tier} <span className="muted">{fmt(list.find((i) => i.tier === tier)!.cost, 0)} ソウル〜</span>
              </h3>
              <div className="shop-grid">
                {list
                  .filter((i) => i.tier === tier)
                  .map((i) => {
                    const has = owned.includes(i.key);
                    return (
                      <button
                        key={i.key}
                        type="button"
                        className={`shop-item${has ? ' owned' : ''}`}
                        aria-pressed={selected?.key === i.key}
                        onClick={() => setSelected(i)}
                        onDoubleClick={() => !has && !full && onAdd(i.key)}
                        title={t(i.name)}
                      >
                        <ItemIcon itemKey={i.key} slot={i.slot} name={t(i.name)} size={48} />
                        <span className="shop-item-name">{t(i.name)}</span>
                        {has && <span className="badge">所持</span>}
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
          {list.length === 0 && <p className="muted">見つかりませんでした</p>}
        </div>
        <aside className="shop-detail">
          {selected ? (
            <>
              <ItemDetail item={selected} />
              <button
                type="button"
                className="primary"
                disabled={owned.includes(selected.key) || full}
                onClick={() => onAdd(selected.key)}
              >
                {owned.includes(selected.key) ? '所持しています' : '追加する'}
              </button>
            </>
          ) : (
            <p className="muted">アイテムを選ぶと効果が表示されます (ダブルクリックですぐ追加)</p>
          )}
        </aside>
      </div>
    </Modal>
  );
}

const SECTION_NAMES = { innate: '常時', passive: 'パッシブ', active: 'アクティブ' } as const;

export function ItemDetail({ item }: { item: Item }) {
  return (
    <div className="item-detail">
      <div className="item-detail-head">
        <ItemIcon itemKey={item.key} slot={item.slot} name={t(item.name)} size={52} />
        <div>
          <strong>{t(item.name)}</strong>
          <div className="muted small">
            {SLOT_NAMES[item.slot]} / Tier {item.tier} / {fmt(item.cost, 0)} ソウル
          </div>
        </div>
      </div>
      {item.sections.map((s, i) => {
        const props = s.props.filter((p) => item.props[p.key] !== undefined);
        if (props.length === 0) return null;
        return (
          <div key={i} className="item-section">
            <div className={`section-tag ${s.type}`}>
              {SECTION_NAMES[s.type]}
              {s.cooldown ? ` ・ CD ${fmt(s.cooldown)}秒` : ''}
            </div>
            <ul>
              {props.map((p) => (
                <li key={p.key}>
                  <span>{t(gameData.labels[p.key]) || p.key}</span>
                  <span className="value">
                    {formatProp(p.key, item.props[p.key])}
                    {p.usage === 'enemy' && <span className="tag enemy">敵</span>}
                    {p.usage === 'conditional' && <span className="tag cond">条件</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
