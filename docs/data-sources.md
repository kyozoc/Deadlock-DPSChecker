# Deadlock ゲームデータ取得元の調査

DPS計算サイトで使うヒーロー・武器・スキル・アイテムのパラメータをどこから取るかの調査メモ。
調査日: 2026-10-21 / 確認したゲームビルド: **6807**（2026-10-20）

## 結論（推奨構成）

| 用途 | 取得元 | 理由 |
| --- | --- | --- |
| メインのデータ（ヒーロー・武器・スキル・アイテム） | **deadlock-wiki/deadlock-data** の `data/json/*.json` | ゲームファイルから自動生成済み、単位がゲーム内表記（m 等）に変換済み、日本語ローカライズあり、MITライセンス |
| 上記に無い細かい値（ヘッドショット倍率など）の補完・検証 | **SteamTracking/GameTracking-Deadlock** の生 `.vdata` | ゲームクライアントから直接ダンプされた一次データ。パッチ当日に更新される |
| 画像（ヒーロー・アイテムアイコン） | **Deadlock API の Assets API**（`assets.deadlock-api.com`） | 静的データ＋画像/アイコンをAPIで配信 |

基本方針: **ビルド時に JSON を取得して静的ファイルとしてサイトに同梱する**（実行時に外部APIへ依存しない）。
パッチが来たら取得スクリプトを再実行して更新する。

---

## 1. deadlock-wiki/deadlock-data（第一候補）

- リポジトリ: https://github.com/deadlock-wiki/deadlock-data （生成元: https://github.com/deadlock-wiki/deadbot ）
- 公式Wiki（deadlock.wiki）の `Data:` 名前空間に使われているデータそのもの
- 取得URL: `https://raw.githubusercontent.com/deadlock-wiki/deadlock-data/master/data/json/<file>.json`
- バージョン: `data/version.txt`（調査時点で `ClientVersion=6807`）

### 主なファイル

| ファイル | 内容 | 件数（調査時点） |
| --- | --- | --- |
| `hero-data.json` | ヒーロー基本ステータス、武器、レベル/スピリットスケーリング、スキル紐付け | 68（開発中・無効含む） |
| `item-data.json` | アイテム（コスト・Tier・スロット・効果値・スケーリング・Corrupted版） | 279 |
| `ability-data.json` | スキル（ダメージ・CD・持続・スピリットスケーリング・アップグレード） | 393 |
| `generic-data.json` | 全体共通値（アイテム価格表、アーマー/スピリット耐性グループ等） | - |
| `attribute-data.json` | ステータス表示名・UI用ラベル | - |
| `item-component-tree.txt` | アイテムの合成ツリー | - |
| `localizations/japanese.json` | 日本語の名前・説明文 | - |

### データ例（Haze, `hero-data.json`）

```jsonc
"MaxHealth": 730.0,
"LevelScaling": { "BulletDamage": 0.143, "MaxHealth": 33.0, "TechPower": 0.5, ... },
"SpiritScaling": { "ClipSize": 0.5 },
"Weapon": {
  "BulletDamage": 5.26, "RoundsPerSecond": 9.5238, "ClipSize": 25, "ReloadTime": 2.35,
  "FalloffStartRange": 19.99, "FalloffEndRange": 46.0,       // m 単位
  "FalloffStartScale": 1.0, "FalloffEndScale": 0.1, "FalloffBias": 0.5,
  "BulletsPerShot": 1, "CanCrit": true,
  "DPS": 50.095, "SustainedDPS": 26.432                        // Wiki側の計算値（検算に使える）
},
"BoundAbilities": { "1": { "Name": "Sleep Dagger", "Key": "ability_sleep_dagger" }, ... }
```

### データ例（アイテム / スキル）

```jsonc
// item-data.json: upgrade_toxic_bullets
"Cost": 3200, "Tier": 3, "Slot": "Weapon", "Activation": "Passive",
"DotHealthPercent": { "Value": 1.9, "Scale": { "Value": 0.006, "Type": "spirit" } },
"BuildUpPerShot": 1.28, "TickRate": 0.5,
"PropertyUpgrades": { ... },   // 強化版
"CorruptedUpgrades": { ... }   // Corrupted版

// ability-data.json: ability_bullet_flurry
"AbilityCooldown": { "Value": 165.0, "Scale": { "Value": 1, "Type": "cooldown" } },
"WeaponDamageBonus": 7, "BonusFireRate": 25,
"Upgrades": [ { "WeaponDamageBonus": 7 }, { "BonusFireRate": 10, ... }, { "AbilityCooldown": -65, ... } ]
```

- `{ "Value": x, "Scale": { "Value": k, "Type": "spirit" } }` は「基礎値 x ＋ スピリットパワー × k」を表す。DPS計算ではこれをそのまま使える。
- `Upgrades` はスキルポイントによる強化 T1/T2/T3 の差分。

### 注意点

- ヘッドショット倍率（`m_flCritBonusStart` 等）のように、一部フィールドは JSON に出ていない → 生 vdata から補完する。
- `IsSelectable` / `IsDisabled` / `InDevelopment` で、プレイ可能なヒーロー・アイテムだけに絞る。

## 2. SteamTracking/GameTracking-Deadlock（一次データ）

- リポジトリ: https://github.com/SteamTracking/GameTracking-Deadlock （SteamDB 運営）
- ゲームクライアントの更新を自動で追跡・ダンプ。最も早く、最も正確だが、形式は Valve の KV3 テキスト
- 主なファイル（`https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/master/` 配下）:

| パス | 内容 |
| --- | --- |
| `game/citadel/pak01_dir/scripts/heroes.vdata` | ヒーロー定義（`m_mapStartingStats`, `m_mapLevelInfo`, `m_mapScalingStats`, `m_mapStandardLevelUpUpgrades`, `m_mapBoundAbilities`） |
| `game/citadel/pak01_dir/scripts/abilities.vdata` | 武器・スキル・アイテム（アイテムは `upgrade_*`、`_class = "citadel_item"`） |
| `game/citadel/pak01_dir/scripts/generic_data.vdata` | 共通定数（Tier別アイテム価格など） |
| `game/citadel/pak01_dir/scripts/modifiers.vdata` | バフ/デバフ（モディファイア）定義 |
| `game/citadel/pak01_dir/scripts/npc_units.vdata` | トルーパー・ガーディアン等のNPC |
| `game/citadel/steam.inf` | ビルド番号 |

武器の例（`citadel_weapon_haze_set`）:

```
m_flBulletDamage = 5.26
m_flCycleTime = 0.105          // 発射間隔（秒）
m_iClipSize = 25
m_reloadDuration = 2.35
m_flDamageFalloffStartRange = 787    // ゲーム内単位（インチ相当）。deadlock-data では m に変換済み
m_flDamageFalloffEndRange = 1811.0
m_flCritBonusStart = 1.65      // ヘッドショット倍率
m_flCritBonusEnd = 1.65
```

- パースには KV3 パーサが必要（Python なら `keyvalues3`、または deadbot の実装を参考にする）。
- 単位変換・スケーリング式の解釈は deadbot のコードが参考になる。

## 3. Deadlock API（deadlock-api.com）

- サイト: https://deadlock-api.com / GitHub: https://github.com/deadlock-api
- **Assets API**（`https://assets.deadlock-api.com`）: ヒーロー・アイテムの静的データ、画像、アイコン、サウンド。`/v2/heroes`, `/v2/items` など
- **Game Data API**（`https://api.deadlock-api.com`）: 試合履歴・プレイヤー統計・ヒーロー/アイテム勝率など（DPS計算には不要だが、将来「人気ビルド」表示などに使える）
- 運営は非公式（Valve 非公認）。アセットのビルドは GitHub Releases（`assets-<build>`）でも公開されている
- ※この調査環境のネットワーク制限で API のレスポンス自体は確認できなかった。実装時にエンドポイントとレスポンス形式を要確認

## 4. その他

- **Deadlock Wiki**（https://deadlock.wiki ）: `Data:HeroData.json`, `Data:ItemData.json` 等。中身は deadlock-data と同じなので、取得は GitHub 側からで良い。DPS・ダメージ計算式の解説ページは仕様確認に有用
- **deadlock-content**（npm）: 2024年で更新停止。使わない

## DPS計算に必要なデータの対応表

| 計算要素 | 取得元 |
| --- | --- |
| 弾ダメージ・連射・装弾数・リロード・減衰 | `hero-data.json` → `Weapon` |
| レベルごとの成長（弾ダメ・HP・スピリット） | `hero-data.json` → `LevelScaling`（詳細は `heroes.vdata` の `m_mapLevelInfo`） |
| ヘッドショット倍率 | `abilities.vdata` の武器 `m_flCritBonusStart/End` |
| スキルのダメージ・スピリットスケーリング・強化段階 | `ability-data.json` |
| アイテムの効果値・コスト・強化/Corrupted版 | `item-data.json` |
| 敵の弾/スピリット耐性 | ヒーロー基礎値 + アイテム（`BulletResist`, `TechResist` 系プロパティ） |
| 日本語表示名 | `localizations/japanese.json` |
