/**
 * ヒーロー・アイテム・アビリティのアイコンを取得して public/icons/ に WebP で保存する。
 *
 *   npm run data:fetch      # 先に実行 (.cache/ の vdata を使う)
 *   npm run images:fetch
 *
 * 画像は vdata に書かれた画像パスから探す。
 *   1. deadlock-api の画像 CDN (最新のゲームビルドから毎日抽出されている)
 *   2. 0xThiagoAmaral/deadlock-open-assets (MIT, 2026年6月時点の抽出。1 に無いものだけ)
 * どちらにも無いものは src/data/icons.json に載らず、サイト側では頭文字で代用する。
 *
 * deadlock-api に1枚も繋がらなかったときは古い画像で上書きしないよう失敗する
 * (--allow-old-images で 2 だけでも続行)。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type ResizeOptions } from 'sharp';
import type { GameData } from '../src/types/game-data.ts';
import { deadlockApiUrl, HERO_ANCHORS, ITEM_ANCHORS } from './lib/image-paths.ts';
import { isObject, parseKv3, type Kv3Object } from './lib/kv3.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');
const IMAGE_CACHE = join(CACHE_DIR, 'images');
const OUT_DIR = join(ROOT, 'public/icons');
// 途中で失敗しても今の画像を壊さないよう、別の場所に作ってから差し替える
const TMP_DIR = join(ROOT, 'public/icons.tmp');
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

type Source = { from: 'deadlock-api'; url: string } | { from: 'open-assets'; path: string };


async function download(source: Source): Promise<Buffer> {
  if (source.from === 'deadlock-api') {
    // 同じ URL のままゲームの更新で絵が変わるのでキャッシュしない
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`${source.url}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const path = source.path;
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

  const jobs: { kind: Kind; key: string; sources: Source[] }[] = [];
  const missing: Record<Kind, string[]> = { heroes: [], heroCards: [], items: [], abilities: [] };
  const add = (kind: Kind, key: string, urls: (string | undefined)[], fallback: string | undefined) => {
    const sources: Source[] = [
      ...[...new Set(urls)].filter((u): u is string => !!u).map((url) => ({ from: 'deadlock-api' as const, url })),
      ...(fallback ? [{ from: 'open-assets' as const, path: fallback }] : []),
    ];
    if (sources.length) jobs.push({ kind, key, sources });
    else missing[kind].push(key);
  };

  for (const hero of Object.values(data.heroes)) {
    // 変身後フォームは変身前の画像を使う
    const baseKey = hero.key.replace(/_transformed$/, '');
    const cardPath = imageOf(heroesVdata, baseKey, 'm_strIconHeroCard');
    const smallPath = imageOf(heroesVdata, baseKey, 'm_strIconImageSmall');
    const card = basename(cardPath).replace(/_card$/, '');
    const small = basename(smallPath).replace(/_sm$/, '');
    const baseName = data.heroes[baseKey]?.name.en ?? hero.name.en;
    const candidates = [slug(baseName), card, small, baseKey.replace(/^hero_/, '')];
    add('heroes', hero.key, [deadlockApiUrl(smallPath, HERO_ANCHORS)], pick(circles, candidates));
    add('heroCards', hero.key, [deadlockApiUrl(cardPath, HERO_ANCHORS)], pick(cards, candidates));
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
      vdataPaths.map((p) => deadlockApiUrl(p, ITEM_ANCHORS)),
      exact ?? pick(items, [...vdataPaths.map(basename), slug(item.name.en), item.key.replace(/^upgrade_/, '')]),
    );
  }
  for (const ability of Object.values(data.abilities)) {
    const imagePath = imageOf(abilitiesVdata, ability.key, 'm_strAbilityImage');
    add('abilities', ability.key, [deadlockApiUrl(imagePath, ITEM_ANCHORS)], pick(abilities, [basename(imagePath)]));
  }

  await rm(TMP_DIR, { recursive: true, force: true });
  for (const { dir } of Object.values(OUTPUT)) await mkdir(join(TMP_DIR, dir), { recursive: true });

  const done: Record<Kind, string[]> = { heroes: [], heroCards: [], items: [], abilities: [] };
  const fromSource = { 'deadlock-api': 0, 'open-assets': 0 };
  const old: string[] = [];
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      let saved = false;
      for (const source of job.sources) {
        try {
          const png = await download(source);
          const out = join(TMP_DIR, OUTPUT[job.kind].dir, `${job.key}.webp`);
          await sharp(png).resize(OUTPUT[job.kind].resize).webp({ quality: 82 }).toFile(out);
          done[job.kind].push(job.key);
          fromSource[source.from]++;
          if (source.from === 'open-assets') old.push(`${job.kind}/${job.key}`);
          saved = true;
          break;
        } catch {
          // 次の取得元を試す
        }
      }
      if (!saved) missing[job.kind].push(job.key);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  if (fromSource['deadlock-api'] === 0 && !process.argv.includes('--allow-old-images')) {
    await rm(TMP_DIR, { recursive: true, force: true });
    throw new Error('deadlock-api の画像に1枚も繋がらなかったので中止した (古い画像で上書きしないため)');
  }
  await rm(OUT_DIR, { recursive: true, force: true });
  await rename(TMP_DIR, OUT_DIR);
  console.log(`取得元: deadlock-api ${fromSource['deadlock-api']} 枚 / deadlock-open-assets ${fromSource['open-assets']} 枚`);
  if (old.length) console.log(`  deadlock-open-assets から: ${old.sort().join(', ')}`);

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
