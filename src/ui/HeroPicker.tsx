import { useMemo, useState } from 'react';
import { gameData } from '../data/index.ts';
import { t } from './format.ts';
import { HeroIcon } from './Icon.tsx';
import { Modal } from './Modal.tsx';

const heroes = Object.values(gameData.heroes).sort((a, b) => t(a.name).localeCompare(t(b.name), 'ja'));

export function HeroPicker({ current, onPick, onClose }: { current: string; onPick: (key: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? heroes.filter((h) => `${h.name.ja ?? ''} ${h.name.en}`.toLowerCase().includes(q)) : heroes;
  }, [query]);

  return (
    <Modal title="ヒーローを選ぶ" onClose={onClose}>
      <input
        className="search"
        type="search"
        placeholder="名前で検索 (日本語 / English)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="hero-grid">
        {list.map((h) => (
          <button
            key={h.key}
            type="button"
            className={`hero-option${h.key === current ? ' selected' : ''}`}
            onClick={() => {
              onPick(h.key);
              onClose();
            }}
          >
            <HeroIcon heroKey={h.key} name={t(h.name)} size={56} />
            <span>{t(h.name)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
