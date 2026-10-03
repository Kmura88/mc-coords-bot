# セットアップガイド（Cloudflare・Discord が初めての人向け）

このガイドどおりに進めれば、Discord で `/add` を打つと座標が登録され、地図ページで見られるようになります。
所要時間の目安は 30〜60 分です。設定は **最初の1回だけ** で、あとは何もしなくても動き続けます。

---

## まず全体像

登場人物は 3 つです。

| 名前 | 何をするもの | このツールでの役割 |
|---|---|---|
| **Cloudflare（クラウドフレア）** | 無料でプログラムや Web ページをネット上に置けるサービス | 座標を保存し、地図ページを公開し、Discord からの命令を処理する |
| **Discord 開発者ポータル** | Discord に自作の Bot（アプリ）を登録する場所 | `/add` などのコマンドを Discord に追加する |
| **自分の PC（WSL）** | 作業する場所 | 地図画像を作って、Cloudflare に送る |

流れはこうです:

```
友達が Discord で /add を打つ
   → Discord が Cloudflare に「こういうコマンドが来たよ」と知らせる
   → Cloudflare 上のプログラムが座標を保存して返事をする
   → Discord に「📍 登録しました」と表示される
```

PC は最初のセットアップに使うだけで、その後は電源を切っていても動きます。

### 用語メモ

- **Worker（ワーカー）**: Cloudflare 上で動く小さなプログラム。このツールの本体
- **D1**: Cloudflare の無料データベース。座標がここに保存される
- **wrangler（ラングラー）**: PC から Cloudflare を操作するためのコマンド。`npx wrangler ...` の形で使う
- **シークレット**: Cloudflare に預ける秘密の値（鍵や合言葉）。コードには書かずに別に保管される
- **デプロイ**: 作ったものをネット上に公開（アップロード）すること

### ⚠️ 秘密にしておくもの

次の 2 つは **他人に見せない・GitHub に上げない・Discord に貼らない** でください。

- Discord の **Bot トークン**（悪用されると Bot を乗っ取られる）
- 地図ページの **合言葉（MAP_KEY）**（知られると拠点の座標が見られる）

逆に、Discord の **Application ID** と **Public Key**（公開鍵）は見られても問題ありません。

---

## ステップ 0: 準備（PC 側）

WSL（Ubuntu）のターミナルで作業します。

### Node.js を入れる

wrangler を動かすのに必要です。バージョン 22 以上が必要です。

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

終わったら **ターミナルを一度閉じて開き直し**、続けて:

```bash
nvm install --lts
node --version     # v22 以上が表示されれば OK
```

### gcc と Pillow を確認

```bash
gcc --version                         # 表示されれば OK
python3 -c "import PIL; print('OK')"  # OK と表示されれば OK
```

どちらかでエラーが出たら:

```bash
sudo apt install build-essential python3-pil
```

---

## ステップ 1: 地図画像を作る

### シード値を調べる

マイクラを起動して、Realms のワールドの **設定（鉛筆アイコン）→ ゲーム** を開くと「シード」欄に数字が書いてあります。マイナスの数字のこともあります（そのまま使います）。

### 地図を生成する

```bash
cd mc-coords-bot/maptools
make
python3 gen_tiles.py 1234567890      # ← 自分のシード値に置き換える
```

2〜3 分ほどで「タイル ○○ 枚を … に出力しました」と出れば成功です。
原点から上下左右 12288 ブロックの範囲が描かれます。もっと広くしたいときは `--radius 20000` を付けます（時間は範囲の 2 乗に比例して増えます）。

---

## ステップ 2: Cloudflare に公開する

### 2-1. アカウントを作る

1. https://dash.cloudflare.com/sign-up を開く
2. メールアドレスとパスワードを入れて登録
3. 届いた確認メールのリンクを押す

ドメインの購入や有料プランの登録を勧められても **不要** です。スキップしてください。
クレジットカードの登録も不要です。

### 2-2. PC から Cloudflare にログインする

```bash
cd mc-coords-bot/worker
npm install                # 必要な部品をダウンロード（初回のみ、少し時間がかかる）
npx wrangler login
```

ブラウザが開いて「wrangler にアクセスを許可しますか？」と聞かれるので **Allow（許可）** を押します。
ターミナルに `Successfully logged in` と出れば OK です。

> **ブラウザが自動で開かない場合**: ターミナルに表示された `https://dash.cloudflare.com/oauth2/...` で始まる長い URL を、Windows 側のブラウザに貼り付けて開いてください。

### 2-3. データベースを作る

```bash
npx wrangler d1 create mc-coords --binding DB --update-config
```

`wrangler.jsonc` の `database_id` が自動的に書き換わります。

続けて、座標を入れる表を作ります:

```bash
npm run db:init
```

「Executed ... queries」のように出れば成功です。

### 2-4. 公開（デプロイ）する

```bash
npm run deploy
```

初めてのときは **workers.dev サブドメインを登録するか** 聞かれることがあります。
`yes` と答えて、好きな英数字の名前（例: `taro-mc`）を入れてください。これが URL の一部になります。

成功すると最後のほうに次のような URL が出ます。**この URL をメモしておきます。**

```
https://mc-coords.taro-mc.workers.dev
```

この時点でブラウザで開くと地図が表示されます（ピンはまだありません）。

### 2-5. 地図ページの合言葉を決める

```bash
npx wrangler secret put MAP_KEY
```

「Enter a secret value:」と出るので、好きな英数字の合言葉を入れて Enter（入力しても画面には表示されません）。
例: `kumo7sakura3`（推測されにくいものにしてください）

ここまでで Cloudflare 側の準備は半分終わりです。残りの `DISCORD_PUBLIC_KEY` は次のステップで Discord から取得します。

---

## ステップ 3: Discord アプリを作る

### 3-1. アプリを作る

1. https://discord.com/developers/applications を開き、Discord アカウントでログイン
2. 右上の **New Application** を押す
3. 名前（例: `座標マップ`）を入れ、利用規約にチェックして **Create**

この名前が Discord 上での Bot の名前になります。左上のアイコンも好きに変えられます。

### 3-2. Public Key を Cloudflare に登録する

1. 左メニューの **General Information** を開く
2. **APPLICATION ID** と **PUBLIC KEY** の下にある **Copy** で値をコピーできます。
   - **APPLICATION ID** はあとで使うのでメモしておく
3. **PUBLIC KEY** をコピーして、ターミナルで:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
```

と打ち、貼り付けて Enter。

### 3-3. Discord に Cloudflare の場所を教える

同じ **General Information** ページの下のほうにある **INTERACTIONS ENDPOINT URL** に、ステップ 2-4 でメモした URL の後ろに `/interactions` を付けたものを入れます:

```
https://mc-coords.taro-mc.workers.dev/interactions
```

ページ下に出る **Save Changes** を押します。

- 保存できれば成功（Discord が Cloudflare に確認の通信を送り、正しく返事が来たという意味）
- 「interactions_endpoint_url: The specified interactions endpoint url could not be verified.」と出たら、ステップ 3-2 の Public Key 登録をやり直してから、もう一度保存してください

### 3-4. Bot トークンを取る

1. 左メニューの **Bot** を開く
2. **Reset Token** を押す（確認が出たら **Yes, do it!**。二段階認証のコードを聞かれることもあります）
3. 表示されたトークンを **Copy**

> トークンは **このとき一度しか表示されません**。なくしたら Reset Token でまた作り直せば OK です。
> このトークンは次のステップでコマンド登録に使うだけなので、どこかに保存しておく必要はありません。

### 3-5. Discord サーバーの ID を調べる

1. Discord アプリの **ユーザー設定（歯車）→ 詳細設定** を開き、**開発者モード** をオン
2. 左のサーバー一覧で、使いたいサーバーのアイコンを右クリック → **サーバーIDをコピー**

### 3-6. コマンドを登録する

ターミナル（`worker` フォルダの中）で、3 つの値を入れて実行します:

```bash
DISCORD_APPLICATION_ID=ここにApplication_ID \
DISCORD_TOKEN=ここにBotトークン \
DISCORD_GUILD_ID=ここにサーバーID \
npm run register
```

「6 個のコマンドを登録しました」と出れば成功です。

### 3-7. サーバーに追加する

1. 開発者ポータルの左メニュー **OAuth2** を開く
2. **OAuth2 URL Generator** の SCOPES で **applications.commands** にチェック（**bot** にはチェック不要）
3. 一番下に出る URL をコピーしてブラウザで開く
4. 追加先のサーバーを選んで **認証**

> サーバーに追加するには、そのサーバーの「サーバー管理」権限が必要です。権限がない場合は、サーバーの管理者に URL を渡して追加してもらってください。

---

## ステップ 4: 動作確認

Discord のサーバーのチャットで `/` を打つと、作ったアプリのコマンドが候補に出ます。

```
/add name:拠点 x:120 z:-340
```

「📍 登録しました」と返ってきたら完成です 🎉
`/map` で出るリンクを開くと、地図にピンが立っています。

---

## 友達への使い方の説明（コピペ用）

> 座標は Discord で登録できるよ
> - `/add name:名前 x:X座標 z:Z座標` で登録（y・メモ・ネザーなども付けられる）
> - `/list` で一覧、`/edit` で修正、`/delete` で削除
> - `/map` で地図のリンクが出る。地図をクリックするとその場所の座標がわかる
> - 座標はゲーム内の設定で「座標を表示」をオンにすると画面左上に出るよ

---

## 困ったとき

| 症状 | 原因と対処 |
|---|---|
| `/` を打ってもコマンドが出ない | Discord アプリを再起動（Ctrl+R）。それでも出なければステップ 3-6 と 3-7 をやり直す |
| 「アプリケーションが応答しませんでした」と出る | `worker` フォルダで `npx wrangler tail` を実行したままコマンドを打つと、エラー内容が表示されます |
| 地図ページで「このリンクでは座標を表示できません」 | URL の `?key=` が合言葉と違う。Discord の `/map` で出たリンクから開く |
| 地図が真っ黒・表示されない | ステップ 1 をやっていない、またはやった後に `npm run deploy` していない |
| `npx: command not found` | Node.js が入っていない。ステップ 0 をやる（ターミナルの開き直しも忘れずに） |
| `wrangler` が `Not logged in` と言う | `npx wrangler login` をもう一度 |

---

## あとからやること

| やりたいこと | コマンド（`worker` フォルダで実行） |
|---|---|
| コードを直したので反映したい | `npm run deploy` |
| 地図を作り直したい（範囲を広げた等） | `maptools` で `gen_tiles.py` を実行 → `worker` で `npm run deploy` |
| 合言葉を変えたい | `npx wrangler secret put MAP_KEY` |
| 座標をバックアップしたい | `npx wrangler d1 export mc-coords --remote --output backup.sql` |
| エラーを調べたい | `npx wrangler tail`（動いている様子がリアルタイムで見える） |

Cloudflare のサイト（https://dash.cloudflare.com）の **Workers & Pages** から、アクセス数やエラーを見ることもできます。
無料枠は 1 日 10 万リクエストまでなので、友達同士で使う分には超えることはまずありません。
