// マイクラ座標共有: Discord スラッシュコマンド + 地図ページ用 API
//
//   POST /interactions  … Discord からのコマンド呼び出し
//   GET  /api/points    … 地図ページが座標一覧を取得（?key=MAP_KEY が必要）
//   それ以外            … public/ の静的ファイル（地図ページ・タイル）

const DIMENSIONS = { overworld: "オーバーワールド", nether: "ネザー", end: "エンド" };

// Discord の定数
const PING = 1, APPLICATION_COMMAND = 2, AUTOCOMPLETE = 4;
const PONG = 1, MESSAGE = 4, AUTOCOMPLETE_RESULT = 8;
const EPHEMERAL = 64;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/interactions" && request.method === "POST") {
      return handleInteraction(request, env);
    }
    if (url.pathname === "/api/points" && request.method === "GET") {
      if (env.MAP_KEY && url.searchParams.get("key") !== env.MAP_KEY) {
        return Response.json({ error: "invalid key" }, { status: 403 });
      }
      const { results } = await env.DB.prepare("SELECT * FROM points ORDER BY id").all();
      return Response.json(results, { headers: { "Cache-Control": "no-store" } });
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// Discord

async function handleInteraction(request, env) {
  const body = await request.text();
  if (!(await verifySignature(request, body, env.DISCORD_PUBLIC_KEY))) {
    return new Response("invalid request signature", { status: 401 });
  }
  const interaction = JSON.parse(body);

  if (interaction.type === PING) return Response.json({ type: PONG });

  const opts = Object.fromEntries((interaction.data.options ?? []).map((o) => [o.name, o]));
  const val = (name) => opts[name]?.value;

  if (interaction.type === AUTOCOMPLETE) {
    const focused = Object.values(opts).find((o) => o.focused);
    return Response.json({
      type: AUTOCOMPLETE_RESULT,
      data: { choices: await pointChoices(env, String(focused?.value ?? "")) },
    });
  }
  if (interaction.type !== APPLICATION_COMMAND) {
    return new Response("unsupported interaction", { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const user = interaction.member?.user ?? interaction.user;
  const author = interaction.member?.nick ?? user?.global_name ?? user?.username ?? "不明";

  switch (interaction.data.name) {
    case "add": {
      const dim = val("dimension") ?? "overworld";
      const p = await env.DB.prepare(
        "INSERT INTO points (name, x, y, z, dimension, note, author) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
      ).bind(val("name"), val("x"), val("y") ?? null, val("z"), dim, val("note") ?? null, author).first();
      let msg = `📍 登録しました\n${fmtPoint(p)}`;
      const hint = portalHint(p);
      if (hint) msg += `\n-# ${hint}`;
      if (dim === "overworld") msg += `\n-# [地図で見る](<${mapUrl(origin, env, p.id)}>)`;
      return reply(msg);
    }

    case "list": {
      let sql = "SELECT * FROM points WHERE 1 = 1";
      const args = [];
      if (val("dimension")) { sql += " AND dimension = ?"; args.push(val("dimension")); }
      if (val("keyword")) { sql += " AND (name LIKE ? OR note LIKE ?)"; args.push(`%${val("keyword")}%`, `%${val("keyword")}%`); }
      const { results } = await env.DB.prepare(sql + " ORDER BY id").bind(...args).all();
      if (!results.length) return reply("該当する座標はありません。", true);
      let msg = `登録座標 ${results.length} 件\n`;
      for (const [i, p] of results.entries()) {
        const line = fmtPoint(p) + "\n";
        if (msg.length + line.length > 1850) {
          msg += `…ほか ${results.length - i} 件（\`keyword\` で絞り込めます）\n`;
          break;
        }
        msg += line;
      }
      return reply(msg + `-# [地図で見る](<${mapUrl(origin, env)}>)`);
    }

    case "info": {
      const p = await getPoint(env, val("point"));
      if (!p) return notFound(val("point"));
      let msg = fmtPoint(p) + `\n　└ 登録: ${p.author}（${p.created_at}）`;
      const hint = portalHint(p);
      if (hint) msg += `\n　└ ${hint}`;
      return reply(msg);
    }

    case "edit": {
      const id = val("point");
      if (!(await getPoint(env, id))) return notFound(id);
      const fields = ["name", "x", "y", "z", "note"].filter((k) => val(k) !== undefined);
      if (fields.length) {
        await env.DB.prepare(`UPDATE points SET ${fields.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
          .bind(...fields.map(val), id).run();
      }
      return reply(`✏️ 修正しました\n${fmtPoint(await getPoint(env, id))}`);
    }

    case "delete": {
      const p = await env.DB.prepare("DELETE FROM points WHERE id = ? RETURNING *").bind(val("point")).first();
      if (!p) return notFound(val("point"));
      return reply(`🗑️ 削除しました: ${fmtPoint(p)}`);
    }

    case "map": {
      const id = val("point");
      if (id !== undefined) {
        const p = await getPoint(env, id);
        if (!p) return notFound(id);
        if (p.dimension !== "overworld") return reply("地図はオーバーワールドのみ対応しています。", true);
      }
      return reply(`🗺️ ${mapUrl(origin, env, id)}`);
    }
  }
  return reply("不明なコマンドです。", true);
}

function reply(content, ephemeral = false) {
  return Response.json({
    type: MESSAGE,
    data: { content, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } },
  });
}

const notFound = (id) => reply(`#${id} は見つかりません。`, true);

function getPoint(env, id) {
  return env.DB.prepare("SELECT * FROM points WHERE id = ?").bind(id).first();
}

async function pointChoices(env, current) {
  const q = current.trim();
  const { results } = await env.DB.prepare(
    "SELECT * FROM points WHERE ? = '' OR name LIKE ? OR note LIKE ? OR CAST(id AS TEXT) LIKE ? ORDER BY id DESC LIMIT 25",
  ).bind(q, `%${q}%`, `%${q}%`, `${q}%`).all();
  return results.map((p) => ({
    name: `#${p.id} ${p.name} (${p.x}, ${p.z})${p.dimension === "overworld" ? "" : " " + DIMENSIONS[p.dimension]}`.slice(0, 100),
    value: p.id,
  }));
}

function fmtPoint(p) {
  const y = p.y !== null ? ` Y=${p.y}` : "";
  let s = `**#${p.id} ${p.name}**  X=${p.x}${y} Z=${p.z}`;
  if (p.dimension !== "overworld") s += `  (${DIMENSIONS[p.dimension]})`;
  if (p.note) s += `\n　└ ${p.note}`;
  return s;
}

function portalHint(p) {
  if (p.dimension === "overworld") return `ネザーでは X=${Math.floor(p.x / 8)} Z=${Math.floor(p.z / 8)} 付近`;
  if (p.dimension === "nether") return `オーバーワールドでは X=${p.x * 8} Z=${p.z * 8} 付近`;
  return null;
}

function mapUrl(origin, env, focus) {
  const params = new URLSearchParams();
  if (env.MAP_KEY) params.set("key", env.MAP_KEY);
  if (focus !== undefined) params.set("focus", focus);
  const qs = params.toString();
  return `${origin}/${qs ? "?" + qs : ""}`;
}

async function verifySignature(request, body, publicKeyHex) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
}
