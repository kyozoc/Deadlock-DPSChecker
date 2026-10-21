import type { GameData } from '../types/game-data.ts';
import raw from './game-data.json';

// 巨大な JSON の推論型は GameData と比較できないので unknown 経由で付け替える
export const gameData = raw as unknown as GameData;
