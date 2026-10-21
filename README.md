# Deadlock DPS Checker

Deadlock で自分と敵のヒーロー・アイテム・スキル・バフを組み合わせて、どれくらいの DPS が出るかを計算するサイト。

https://kyozoc.github.io/Deadlock-DPSChecker/

## ゲームデータ

`src/data/game-data.json` に DPS 計算用に整形したゲームデータが入っている（型は `src/types/game-data.ts`）。
取得元や各フィールドの意味は [docs/data-sources.md](docs/data-sources.md) を参照。

パッチが来たら再生成する:

```sh
npm install
npm run data:fetch              # 最新データを取得して game-data.json を作り直す
npm run data:fetch -- --offline # .cache/ の前回取得分から作り直す（整形ロジックを変えたとき用）
npm run images:fetch            # アイコンを public/icons/ に取得 (data:fetch の後に実行)
```

GitHub Actions (`.github/workflows/update-data.yml`) が毎日これを実行し、
変更があればテストを通したうえで main に commit して公開し直す。

アイコンは最新のゲームビルドから毎日抽出されている deadlock-api の画像 CDN から取得し、
そこに無いものだけ [deadlock-open-assets](https://github.com/0xThiagoAmaral/deadlock-open-assets) (MIT) で補う。
どちらにも無いものは頭文字で表示する。deadlock-api に繋がらない環境では古い画像で上書きしないよう中止する。

取得元のビルドがずれている・欠損があるなどの問題は `meta.warnings` と実行時のログに出る。

## 開発

```sh
npm run dev        # ローカルで起動 (http://localhost:5173/Deadlock-DPSChecker/)
npm test           # テスト
npm run typecheck  # 型チェック
npm run build      # dist/ に本番用ビルド
```

## 公開

`main` ブランチに push すると GitHub Actions (`.github/workflows/deploy.yml`) が
型チェック・テスト・ビルドをして GitHub Pages に公開する。
公開先: https://kyozoc.github.io/Deadlock-DPSChecker/

初回のみリポジトリの Settings → Pages → Build and deployment → Source を「GitHub Actions」にする。
