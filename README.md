# mc-coords — マイクラ座標共有マップ

Minecraft 統合版（Bedrock / Realms）を友達と遊ぶための座標共有ツールです。
Discord のスラッシュコマンドで座標を登録し、シード値から生成した地形図の上でみんなのピンを確認できます。

- **常時起動のサーバー不要** — Cloudflare Workers + D1 の無料枠だけで動作
- **構造物は表示しない** — 地図はバイオームと起伏のみ。村・神殿・遺跡などは自分で探す前提
- **Discord でも Web でも登録できる** — 地図ページは拡大縮小・検索・スマホ対応

## 機能

### Discord コマンド

| コマンド | 内容 |
|---|---|
| `/add name x z [y] [dimension] [category] [note]` | 座標を登録（ネザー換算座標も表示） |
| `/list [dimension] [category] [keyword]` | 一覧・検索 |
| `/info point` | 詳細（登録者・日時・ネザー換算） |
| `/edit point [name] [x] [y] [z] [category] [note]` | 修正 |
| `/delete point` | 削除 |
| `/map [point]` | 地図ページのリンクを表示 |

`point` は名前・番号でオートコンプリートされます。

カテゴリは 拠点 / 村 / 遺跡 / 洞窟 / ポータル / 資源 / 装置・トラップ / その他 の 8 種類（未指定は「その他」）。

### 地図ページ

- シード値から事前生成した地形タイル（バイオーム色 + 陰影）を Leaflet で表示
- 登録座標をピンとラベルで表示、サイドバーから検索・ジャンプ
- カテゴリごとにピンを色分けし、サイドバーで表示・非表示を切り替え
- 地図をクリックするとその地点の座標・ネザー換算を表示し、そのまま登録できる
- 座標の追加・編集・削除（登録者名はブラウザに記憶）
- 座標の閲覧・編集には合言葉（`MAP_KEY`）が必要。`/map` が出すリンクに含まれる。合言葉なしでは地形だけが見える

地図はオーバーワールドの地形です。ネザーの座標はサイドバーのチェックで、8 倍した地上の位置に点線のピンで重ねて表示できます。エンドの座標は一覧にだけ表示されます。

## 構成

```
maptools/                シード値 → 地図タイル生成（初回に一度だけローカルで実行）
  native/mapgen.c          cubiomes を使ったバイオーム + 概算高度の描画
  gen_tiles.py             全体を描画して Leaflet 用タイル (WebP) に分割
  cubiomes/                https://github.com/Cubitect/cubiomes（MIT, 同梱）
worker/                  Cloudflare Worker
  src/index.js             Discord Interactions の処理と座標 API（GET/POST/PATCH/DELETE /api/points）
  public/index.html        地図ページ
  public/tiles/            生成されたタイル（git 管理外）
  schema.sql               D1 のテーブル定義
  scripts/                 スラッシュコマンドの定義と登録スクリプト
docs/SETUP_GUIDE.md      初めての人向けセットアップ手順（Cloudflare / Discord の操作を詳しく）
```

```
Discord ──(HTTPS: /interactions)──▶ Cloudflare Worker ──▶ D1 (座標)
ブラウザ ──(/ , /tiles, /api/points)──▶      〃
```

Discord の HTTP Interactions を使うため、Gateway 接続を維持するプロセスは不要です。

## セットアップ

Cloudflare や Discord 開発者ポータルを初めて触る場合は **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)** を参照してください。以下は要点のみです。

必要なもの: Node.js 22 以上、gcc、Python 3 + Pillow、Cloudflare アカウント、Discord アカウント

```bash
# 1. 地図タイルを生成
cd maptools
make
python3 gen_tiles.py <シード値> [--radius 12288]

# 2. Cloudflare にデプロイ
cd ../worker
npm install
npx wrangler login
npx wrangler d1 create mc-coords --binding DB --update-config   # wrangler.jsonc に ID が書き込まれる
npm run db:init
npm run deploy
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put MAP_KEY

# 3. Discord 開発者ポータルで Interactions Endpoint URL に
#    https://<worker>.workers.dev/interactions を設定し、
#    applications.commands スコープの招待 URL でサーバーに追加してから、コマンドを登録
DISCORD_APPLICATION_ID=... DISCORD_TOKEN=... DISCORD_GUILD_ID=... npm run register
```


### 環境変数・シークレット

| 名前 | 用途 | 設定場所 |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | Discord からのリクエストの署名検証 | `wrangler secret put` |
| `MAP_KEY` | 地図ページで座標を見る・編集するための合言葉（未設定だと閲覧は誰でも可、Web からの編集は不可） | `wrangler secret put` |
| `DISCORD_APPLICATION_ID` / `DISCORD_TOKEN` / `DISCORD_GUILD_ID` | コマンド登録時のみ使用 | 実行時の環境変数 |

### 既存の環境をアップデートするとき

カテゴリ機能の追加で D1 に列が増えています。以前のバージョンから更新する場合は一度だけ次を実行してください。

```bash
cd worker
npm run db:migrate   # points に category 列を追加（既存の座標は「その他」になる）
npm run deploy
DISCORD_APPLICATION_ID=... DISCORD_TOKEN=... DISCORD_GUILD_ID=... npm run register   # コマンドのオプション追加を反映
```

### ローカル開発

```bash
cd worker
echo "DISCORD_PUBLIC_KEY=<公開鍵>" > .dev.vars
npx wrangler d1 execute mc-coords --local --file=schema.sql
npm run dev
```

## 地図の精度

統合版と Java 版は 1.18 以降、同じシード値でほぼ同じバイオーム配置になります。本ツールは cubiomes の Java 版生成ロジックで地形を描いているため、細部の境界や高さはズレることがあります。大まかな地形の把握が目的です。

## ライセンス

[MIT License](LICENSE)

同梱の [cubiomes](maptools/cubiomes) も MIT License です（`maptools/cubiomes/LICENSE`）。
