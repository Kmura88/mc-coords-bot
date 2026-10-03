// スラッシュコマンドを Discord に登録する（コマンド定義を変えたときだけ実行）
// 使い方: DISCORD_APPLICATION_ID=... DISCORD_TOKEN=... [DISCORD_GUILD_ID=...] npm run register
import { COMMANDS } from "./commands.js";

const { DISCORD_APPLICATION_ID: app, DISCORD_TOKEN: token, DISCORD_GUILD_ID: guild } = process.env;
if (!app || !token) {
  console.error("DISCORD_APPLICATION_ID と DISCORD_TOKEN を指定してください");
  process.exit(1);
}

// サーバーID を指定するとそのサーバーに即時反映、指定しないと全体（反映に時間がかかることがある）
const url = guild
  ? `https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`
  : `https://discord.com/api/v10/applications/${app}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(COMMANDS),
});
if (!res.ok) {
  console.error(`登録に失敗しました: ${res.status}`, await res.text());
  process.exit(1);
}
console.log(`${COMMANDS.length} 個のコマンドを登録しました`);
