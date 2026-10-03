// Discord に登録するスラッシュコマンドの定義
const STRING = 3;
const INTEGER = 4;

const DIMENSION = {
  type: STRING, name: "dimension", description: "ディメンション（既定: オーバーワールド）",
  choices: [
    { name: "オーバーワールド", value: "overworld" },
    { name: "ネザー", value: "nether" },
    { name: "エンド", value: "end" },
  ],
};
const CATEGORY = {
  type: STRING, name: "category", description: "カテゴリ（既定: その他）",
  choices: [
    { name: "拠点", value: "base" },
    { name: "村", value: "village" },
    { name: "ポータル", value: "portal" },
    { name: "資源", value: "resource" },
    { name: "装置・トラップ", value: "farm" },
    { name: "その他", value: "other" },
  ],
};
const POINT = (description) => ({
  type: INTEGER, name: "point", description, required: true, autocomplete: true,
});

export const COMMANDS = [
  {
    name: "add", description: "座標を登録します",
    options: [
      { type: STRING, name: "name", description: "名前（例: 拠点、村、ピグリン交易所）", required: true, max_length: 50 },
      { type: INTEGER, name: "x", description: "X座標", required: true },
      { type: INTEGER, name: "z", description: "Z座標", required: true },
      { type: INTEGER, name: "y", description: "Y座標（任意）" },
      DIMENSION,
      CATEGORY,
      { type: STRING, name: "note", description: "メモ（任意）", max_length: 200 },
    ],
  },
  {
    name: "list", description: "登録済みの座標一覧を表示します",
    options: [
      { ...DIMENSION, description: "ディメンションで絞り込み" },
      { ...CATEGORY, description: "カテゴリで絞り込み" },
      { type: STRING, name: "keyword", description: "名前・メモで検索" },
    ],
  },
  { name: "info", description: "座標の詳細を表示します", options: [POINT("座標（番号か名前で検索）")] },
  {
    name: "edit", description: "登録済みの座標を修正します",
    options: [
      POINT("修正する座標"),
      { type: STRING, name: "name", description: "新しい名前", max_length: 50 },
      { type: INTEGER, name: "x", description: "X座標" },
      { type: INTEGER, name: "y", description: "Y座標" },
      { type: INTEGER, name: "z", description: "Z座標" },
      { ...CATEGORY, description: "カテゴリ" },
      { type: STRING, name: "note", description: "メモ", max_length: 200 },
    ],
  },
  { name: "delete", description: "座標を削除します", options: [POINT("削除する座標")] },
  {
    name: "map", description: "地図ページのリンクを表示します",
    options: [{ ...POINT("この座標を中心に表示"), required: false }],
  },
];
