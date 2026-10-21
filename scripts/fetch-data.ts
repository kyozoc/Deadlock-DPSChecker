/**
 * ゲームデータを取得して src/data/game-data.json を生成する。
 *
 *   npm run data:fetch             # 最新を取得
 *   npm run data:fetch -- --offline  # .cache/ にある前回の取得分から作り直す
 *
 * 取得元の詳細は docs/data-sources.md を参照。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKv3 } from './lib/kv3.ts';
import { buildGameData } from './lib/normalize.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');
const OUTPUT = join(ROOT, 'src/data/game-data.json');

const DEADLOCK_DATA = 'https://raw.githubusercontent.com/deadlock-wiki/deadlock-data/master/data';
const GAME_TRACKING = 'https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/master/game/citadel';

const SOURCES = {
  heroData: `${DEADLOCK_DATA}/json/hero-data.json`,
  abilityData: `${DEADLOCK_DATA}/json/ability-data.json`,
  itemData: `${DEADLOCK_DATA}/json/item-data.json`,
  soulUnlockData: `${DEADLOCK_DATA}/json/soul-unlock-data.json`,
  japanese: `${DEADLOCK_DATA}/localizations/japanese.json`,
  dataVersion: `${DEADLOCK_DATA}/version.txt`,
  heroesVdata: `${GAME_TRACKING}/pak01_dir/scripts/heroes.vdata`,
  abilitiesVdata: `${GAME_TRACKING}/pak01_dir/scripts/abilities.vdata`,
  vdataVersion: `${GAME_TRACKING}/steam.inf`,
} as const;

type SourceName = keyof typeof SOURCES;

async function load(name: SourceName, offline: boolean): Promise<string> {
  const cachePath = join(CACHE_DIR, `${name}${SOURCES[name].match(/\.\w+$/)?.[0] ?? ''}`);
  if (offline) return readFile(cachePath, 'utf8');

  const res = await fetch(SOURCES[name]);
  if (!res.ok) throw new Error(`${SOURCES[name]} の取得に失敗: HTTP ${res.status}`);
  const text = await res.text();
  await writeFile(cachePath, text);
  return text;
}

function parseClientVersion(inf: string): number {
  const m = inf.match(/^ClientVersion=(\d+)/m);
  if (!m) throw new Error('ClientVersion が見つからない');
  return Number(m[1]);
}

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline');
  await mkdir(CACHE_DIR, { recursive: true });

  const names = Object.keys(SOURCES) as SourceName[];
  const texts = Object.fromEntries(
    await Promise.all(names.map(async (n) => [n, await load(n, offline)] as const)),
  ) as Record<SourceName, string>;

  const data = buildGameData({
    heroData: JSON.parse(texts.heroData),
    abilityData: JSON.parse(texts.abilityData),
    itemData: JSON.parse(texts.itemData),
    soulUnlockData: JSON.parse(texts.soulUnlockData),
    japanese: JSON.parse(texts.japanese),
    heroesVdata: parseKv3(texts.heroesVdata),
    abilitiesVdata: parseKv3(texts.abilitiesVdata),
    gameVersion: parseClientVersion(texts.dataVersion),
    vdataVersion: parseClientVersion(texts.vdataVersion),
  });

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);

  console.log(`build ${data.meta.gameVersion}: ` +
    `ヒーロー ${Object.keys(data.heroes).length} / アビリティ ${Object.keys(data.abilities).length} / ` +
    `アイテム ${Object.keys(data.items).length} → ${OUTPUT}`);
  for (const w of data.meta.warnings) console.warn(`  warning: ${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
