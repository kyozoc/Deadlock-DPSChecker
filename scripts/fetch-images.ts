/**
 * ヒーロー・アイテム・アビリティのアイコンを取得して public/icons/ に WebP で保存する。
 *
 *   npm run data:fetch      # 先に実行 (.cache/ の vdata を使う)
 *   npm run images:fetch
 *
 * 画像の取得元は 0xThiagoAmaral/deadlock-open-assets (MIT, ゲームファイルから抽出した PNG)。
 * vdata に書かれた画像パスのファイル名で突き合わせる。見つからないものは
 * src/data/icons.json に載らず、サイト側では頭文字で代用する。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type ResizeOptions } from 'sharp';
import type { GameData } from '../src/types/game-data.ts';
import { isObject, parseKv3, type Kv3Object } from './lib/kv3.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');
const IMAGE_CACHE = join(CACHE_DIR, 'images');
const OUT_DIR = join(ROOT, 'public/icons');
const MANIFEST = join(ROOT, 'src/data/icons.json');

const REPO = '0xThiagoAmaral/deadlock-open-assets';
// 再現性のため取得するコミットを固定する。更新するときはここを書き換える
const COMMIT = '26717892fd7e6b78f3e75a41f3ad5eea494b456d';

type Kind = 'heroes' | 'heroCards' | 'items' | 'abilities';

const OUTPUT: Record<Kind, { dir: string; resize: ResizeOptions }> = {
  heroes: { dir: 'heroes', resize: { width: 128, height: 128, fit: 'cover' } },
  heroCards: { dir: 'hero-cards', resize: { width: 240, withoutEnlargement: true } },
  items: { dir: 'items', resize: { width: 96, height: 96, fit: 'contain', background: '#0000' } },
  abilities: { dir: 'abilities', resize: { width: 96, height: 96, fit: 'contain', background: '#0000' } },
};

function listRepoImages(): string[] {
  const dir = execFileSync('mktemp', ['-d']).toString().trim();
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    git('init', '-q');
    git('fetch', '-q', '--depth', '1', '--filter=blob:none', `https://github.com/${REPO}.git`, COMMIT);
    return git('ls-tree', '-r', '--name-only', 'FETCH_HEAD', 'images/deadlock').toString().trim().split('\n');
  } finally {
    execFileSync('rm', ['-rf', dir]);
  }
}

/** ファイル名 (拡張子なし) → パス。同名があれば先に見つかったもの */
function indexByBasename(paths: string[], prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  // brawl (Street Brawl 版) より通常版を優先する
  const sorted = paths.filter((p) => p.startsWith(prefix)).sort((a, b) => Number(a.includes('/brawl/')) - Number(b.includes('/brawl/')));
  for (const p of sorted) {
    const base = basename(p);
    if (!map.has(base)) map.set(base, p);
  }
  return map;
}

function basename(path: string | undefined): string {
  return (path ?? '').split('/').pop()!.replace(/\.(png|psd|svg|vtex)$/i, '');
}

function slug(text: string): string {
  return text.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function pick(index: Map<string, string>, candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (c && index.has(c)) return index.get(c);
  }
  return undefined;
}

async function download(path: string): Promise<Buffer> {
  const cached = join(IMAGE_CACHE, COMMIT, path);
  if (existsSync(cached)) return readFile(cached);
  const res = await fetch(`https://media.githubusercontent.com/media/${REPO}/${COMMIT}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(cached), { recursive: true });
  await writeFile(cached, buf);
  return buf;
}

async function main(): Promise<void> {
  const data = JSON.parse(await readFile(join(ROOT, 'src/data/game-data.json'), 'utf8')) as GameData;
  const heroesVdata = parseKv3(await readFile(join(CACHE_DIR, 'heroesVdata.vdata'), 'utf8'));
  const abilitiesVdata = parseKv3(await readFile(join(CACHE_DIR, 'abilitiesVdata.vdata'), 'utf8'));
  const imageOf = (vdata: Kv3Object, key: string, field: string) => {
    const entry = vdata[key];
    return isObject(entry) && typeof entry[field] === 'string' ? (entry[field] as string) : undefined;
  };

  const repoImages = listRepoImages();
  const circles = indexByBasename(repoImages, 'images/deadlock/heroes_circle/');
  const cards = indexByBasename(repoImages, 'images/deadlock/heroes_card/');
  const items = indexByBasename(repoImages, 'images/deadlock/items/');
  const abilities = indexByBasename(repoImages, 'images/deadlock/abilities/');

  const jobs: { kind: Kind; key: string; path: string }[] = [];
  const missing: Record<Kind, string[]> = { heroes: [], heroCards: [], items: [], abilities: [] };
  const add = (kind: Kind, key: string, path: string | undefined) =>
    path ? jobs.push({ kind, key, path }) : missing[kind].push(key);

  for (const hero of Object.values(data.heroes)) {
    // 変身後フォームは変身前の画像を使う
    const baseKey = hero.key.replace(/_transformed$/, '');
    const card = basename(imageOf(heroesVdata, baseKey, 'm_strIconHeroCard')).replace(/_card$/, '');
    const small = basename(imageOf(heroesVdata, baseKey, 'm_strIconImageSmall')).replace(/_sm$/, '');
    const baseName = data.heroes[baseKey]?.name.en ?? hero.name.en;
    const candidates = [slug(baseName), card, small, baseKey.replace(/^hero_/, '')];
    add('heroes', hero.key, pick(circles, candidates));
    add('heroCards', hero.key, pick(cards, candidates));
  }
  const allImages = new Set(repoImages);
  for (const item of Object.values(data.items)) {
    // m_strAbilityImage が無いアイテムもあるので m_strShopIconLarge も見る
    const vdataPaths = ['m_strAbilityImage', 'm_strShopIconLarge']
      .map((field) => imageOf(abilitiesVdata, item.key, field))
      .filter((p): p is string => !!p);
    // upgrades/ 以下などは vdata の画像パスと同じ構成なので、まずそのまま探す
    const exact = vdataPaths
      .map((p) => p.match(/\{images\}\/(.+)\.\w+$/)?.[1])
      .map((p) => p && `images/deadlock/${p}.png`)
      .find((p) => p && allImages.has(p));
    add(
      'items',
      item.key,
      exact ?? pick(items, [...vdataPaths.map(basename), slug(item.name.en), item.key.replace(/^upgrade_/, '')]),
    );
  }
  for (const ability of Object.values(data.abilities)) {
    const image = basename(imageOf(abilitiesVdata, ability.key, 'm_strAbilityImage'));
    add('abilities', ability.key, pick(abilities, [image]));
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  for (const { dir } of Object.values(OUTPUT)) await mkdir(join(OUT_DIR, dir), { recursive: true });

  const done: Record<Kind, string[]> = { heroes: [], heroCards: [], items: [], abilities: [] };
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const png = await download(job.path);
        const out = join(OUT_DIR, OUTPUT[job.kind].dir, `${job.key}.webp`);
        await sharp(png).resize(OUTPUT[job.kind].resize).webp({ quality: 82 }).toFile(out);
        done[job.kind].push(job.key);
      } catch (err) {
        console.warn(`  warning: ${job.kind}/${job.key}: ${(err as Error).message}`);
        missing[job.kind].push(job.key);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  const manifest = Object.fromEntries(
    (Object.keys(done) as Kind[]).map((k) => [k, done[k].sort()]),
  ) as Record<Kind, string[]>;
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const kind of Object.keys(done) as Kind[]) {
    const miss = missing[kind].sort();
    console.log(`${kind}: ${done[kind].length} 件${miss.length ? ` (画像なし ${miss.length}: ${miss.join(', ')})` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
