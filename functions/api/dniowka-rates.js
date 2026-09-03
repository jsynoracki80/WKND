// =============================================================
// Cloudflare Pages Function: stawki dniowki per trasa (edytowalne
// w apce). Magazyn: Cloudflare Workers KV, klucz "rates:current".
// =============================================================

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KEY = "rates:current";

function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: HEADERS });
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
      const data = (await kv.get(KEY, { type: "json" })) || {};
      return json(200, data);
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));

      if (PASSWORD && body.password !== PASSWORD) {
        return json(401, { error: "Nieprawidłowe hasło." });
      }

      const { rates } = body;
      if (!rates || typeof rates !== "object") {
        return json(400, { error: "Brak wymaganego pola (rates: {trasa: kwota})." });
      }

      await kv.put(KEY, JSON.stringify(rates));
      return json(200, { ok: true, data: rates });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: "Błąd serwera: " + (err && err.message ? err.message : String(err)) });
  }
}
