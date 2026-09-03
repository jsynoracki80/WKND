// =============================================================
// Cloudflare Pages Function: prowizje kurierow (PURE) - jeden
// wpis na sobote. Magazyn: Cloudflare Workers KV, prefiks "comm:".
// Historia zachowana: kazda sobota to osobny klucz.
// =============================================================

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: HEADERS });
}

function entryKey(date) {
  return `comm:${date}`;
}

async function getAllEntries(kv) {
  const result = {};
  let cursor;
  do {
    const list = await kv.list({ prefix: "comm:", cursor });
    await Promise.all(
      list.keys.map(async (k) => {
        const value = await kv.get(k.name, { type: "json" });
        if (value != null) result[k.name.slice(5)] = value; // usun prefiks "comm:"
      })
    );
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return result;
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.WEEKEND_KV;
  const PASSWORD = env.WEEKEND_APP_PASSWORD;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  try {
    if (request.method === "GET") {
      const data = await getAllEntries(kv);
      return json(200, data);
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));

      if (PASSWORD && body.password !== PASSWORD) {
        return json(401, { error: "Nieprawidłowe hasło." });
      }

      const { date, rows, fileName } = body;
      if (!date || !Array.isArray(rows)) {
        return json(400, { error: "Brak wymaganych pól (date, rows[])." });
      }

      await kv.put(
        entryKey(date),
        JSON.stringify({ rows, fileName: fileName || null, uploadedAt: new Date().toISOString() })
      );

      const data = await getAllEntries(kv);
      return json(200, { ok: true, data });
    }

    if (request.method === "DELETE") {
      const body = await request.json().catch(() => ({}));

      if (PASSWORD && body.password !== PASSWORD) {
        return json(401, { error: "Nieprawidłowe hasło." });
      }

      const { date } = body;
      if (!date) {
        return json(400, { error: "Brak wymaganego pola (date)." });
      }

      await kv.delete(entryKey(date));

      const data = await getAllEntries(kv);
      return json(200, { ok: true, data });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: "Błąd serwera: " + (err && err.message ? err.message : String(err)) });
  }
}
