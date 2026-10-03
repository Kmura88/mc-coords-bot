// マイクラ座標共有: Discord スラッシュコマンド + 地図ページ用 API
//
//   POST /interactions  … Discord からのコマンド呼び出し
//   GET    /api/points      … 地図ページが座標一覧を取得
//   POST   /api/points      … 地図ページから座標を登録
//   PATCH  /api/points/:id  … 地図ページから座標を修正
//   DELETE /api/points/:id  … 地図ページから座標を削除
//     （/api/* はすべて ?key=MAP_KEY が必要）
//   それ以外            … public/ の静的ファイル（地図ページ・タイル）

const DIMENSIONS = { overworld: "オーバーワールド", nether: "ネザー", end: "エンド" };
const CATEGORIES = {
  base: "拠点", village: "村", portal: "ポータル", resource: "資源", farm: "装置・トラップ", other: "その他",
};

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
    if (url.pathname.startsWith("/api/points")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// 地図ページ用 API

async function handleApi(request, env, url) {
  const method = request.method;
  // 書き込みは合言葉の設定を必須にする（未設定だと誰でも書き換えられてしまうため）
  if ((env.MAP_KEY || method !== "GET") && url.searchParams.get("key") !== env.MAP_KEY) {
    return Response.json({ error: "invalid key" }, { status: 403 });
  }
  const m = url.pathname.match(/^\/api\/points(?:\/(\d+))?$/);
  if (!m) return Response.json({ error: "not found" }, { status: 404 });
  const id = m[1] && Number(m[1]);

  if (method === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT * FROM points ORDER BY id").all();
    return Response.json(results, { headers: { "Cache-Control": "no-store" } });
  }

  if (method === "POST" && !id) {
    const input = validatePoint(await request.json().catch(() => null), true);
    if (input.error) return Response.json(input, { status: 400 });
    const p = await env.DB.prepare(
      "INSERT INTO points (name, x, y, z, dimension, category, note, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    ).bind(input.name, input.x, input.y, input.z, input.dimension, input.category, input.note, input.author).first();
    return Response.json(p, { status: 201 });
  }

  if (method === "PATCH" && id) {
    const input = validatePoint(await request.json().catch(() => null), false);
    if (input.error) return Response.json(input, { status: 400 });
    delete input.author; // 登録者は変えない
    const fields = Object.keys(input);
    if (!fields.length) return Response.json({ error: "変更する項目がありません" }, { status: 400 });
    const p = await env.DB.prepare(
      `UPDATE points SET ${fields.map((k) => `${k} = ?`).join(", ")} WHERE id = ? RETURNING *`,
    ).bind(...fields.map((k) => input[k]), id).first();
    return p ? Response.json(p) : Response.json({ error: "not found" }, { status: 404 });
  }

  if (method === "DELETE" && id) {
    const p = await env.DB.prepare("DELETE FROM points WHERE id = ? RETURNING *").bind(id).first();
    return p ? Response.json(p) : Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}

// 入力チェック。required=false（修正）のときは渡された項目だけを返す。
// y と note は null（空欄）にできる。
const LABELS = { name: "名前", x: "X", y: "Y", z: "Z", note: "メモ", author: "あなたの名前" };

function validatePoint(body, required) {
  if (!body || typeof body !== "object") return { error: "入力が正しくありません" };
  const out = {};
  const text = (k, max, nullable) => {
    if (!(k in body)) return required && !nullable ? `${LABELS[k]} は必須です` : null;
    const v = body[k] === null ? "" : String(body[k]).trim();
    if (!v) {
      if (nullable) { out[k] = null; return null; }
      return `${LABELS[k]} は必須です`;
    }
    if (v.length > max) return `${LABELS[k]} は ${max} 文字以内にしてください`;
    out[k] = v;
    return null;
  };
  const int = (k, min, max, nullable) => {
    if (!(k in body)) return required && !nullable ? `${LABELS[k]} は必須です` : null;
    if ((body[k] === null || body[k] === "") && nullable) { out[k] = null; return null; }
    const v = Number(body[k]);
    if (!Number.isInteger(v) || v < min || v > max) return `${LABELS[k]} は ${min}〜${max} の整数にしてください`;
    out[k] = v;
    return null;
  };
  const err =
    text("name", 50, false) ||
    int("x", -30000000, 30000000, false) ||
    int("z", -30000000, 30000000, false) ||
    int("y", -64, 320, true) ||
    text("note", 200, true) ||
    text("author", 32, false);
  if (err) return { error: err };
  if ("dimension" in body) {
    if (!Object.hasOwn(DIMENSIONS, body.dimension)) return { error: "ディメンションが正しくありません" };
    out.dimension = body.dimension;
  } else if (required) {
    out.dimension = "overworld";
  }
  if ("category" in body) {
    if (!Object.hasOwn(CATEGORIES, body.category)) return { error: "カテゴリが正しくありません" };
    out.category = body.category;
  } else if (required) {
    out.category = "other";
  }
  if (required) {
    out.y ??= null;
    out.note ??= null;
  }
  return out;
}

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
        "INSERT INTO points (name, x, y, z, dimension, category, note, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
      ).bind(val("name"), val("x"), val("y") ?? null, val("z"), dim, val("category") ?? "other", val("note") ?? null, author).first();
      let msg = `📍 登録しました\n${fmtPoint(p)}`;
      const hint = portalHint(p);
      if (hint) msg += `\n-# ${hint}`;
      if (dim !== "end") msg += `\n-# [地図で見る](<${mapUrl(origin, env, p.id)}>)`;
      return reply(msg);
    }

    case "list": {
      let sql = "SELECT * FROM points WHERE 1 = 1";
      const args = [];
      if (val("dimension")) { sql += " AND dimension = ?"; args.push(val("dimension")); }
      if (val("category")) { sql += " AND category = ?"; args.push(val("category")); }
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
      const fields = ["name", "x", "y", "z", "category", "note"].filter((k) => val(k) !== undefined);
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
        if (p.dimension === "end") return reply("エンドの座標は地図に表示できません。", true);
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
  if (Object.hasOwn(CATEGORIES, p.category) && p.category !== "other") s += `  [${CATEGORIES[p.category]}]`;
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
