// =============================================================
// Trasy Weekendowe — Cloudflare Worker (statyczne pliki + API)
// Aktualny (2026) model Cloudflare: jeden Worker obsługuje zarówno
// statyczne zasoby (przez binding ASSETS, skonfigurowany w
// wrangler.toml), jak i endpointy /api/* poniżej. Magazyn: Workers
// KV (binding WEEKEND_KV).
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

async function getAllByPrefix(kv, prefix) {
  const result = {};
  let cursor;
  do {
    const list = await kv.list({ prefix, cursor });
    await Promise.all(
      list.keys.map(async (k) => {
        const value = await kv.get(k.name, { type: "json" });
        if (value != null) result[k.name.slice(prefix.length)] = value;
      })
    );
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return result;
}

// -------------------------------------------------------------
// /api/declarations — deklaracje kurierów (slot 1 i 2)
// -------------------------------------------------------------

async function handleDeclarations(request, env) {
  const kv = env.WEEKEND_KV;
  const PASSWORD = env.WEEKEND_APP_PASSWORD;
  const entryKey = (route, date, slot) =>
    slot === 2 ? `decl:${route}__${date}__2` : `decl:${route}__${date}`;

  if (request.method === "GET") {
    return json(200, await getAllByPrefix(kv, "decl:"));
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { route, date, courierNr, courierName, carrier, slot } = body;
    if (!route || !date || !courierNr || !courierName) {
      return json(400, { error: "Brak wymaganych pól (route, date, courierNr, courierName)." });
    }

    await kv.put(
      entryKey(route, date, slot),
      JSON.stringify({ courierNr, courierName, carrier: carrier || null, savedAt: new Date().toISOString() })
    );
    return json(200, { ok: true, data: await getAllByPrefix(kv, "decl:") });
  }

  if (request.method === "DELETE") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { route, date, slot } = body;
    if (!route || !date) return json(400, { error: "Brak wymaganych pól (route, date)." });

    await kv.delete(entryKey(route, date, slot));
    return json(200, { ok: true, data: await getAllByPrefix(kv, "decl:") });
  }

  return json(405, { error: "Method not allowed" });
}

// -------------------------------------------------------------
// /api/rotation-overrides — reczne zamiany kolejnosci rotacji
// -------------------------------------------------------------

async function handleRotationOverrides(request, env) {
  const kv = env.WEEKEND_KV;
  const PASSWORD = env.WEEKEND_APP_PASSWORD;
  const entryKey = (route, date) => `rot:${route}__${date}`;

  if (request.method === "GET") {
    return json(200, await getAllByPrefix(kv, "rot:"));
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { route, date, carrier } = body;
    if (!route || !date || !carrier) return json(400, { error: "Brak wymaganych pól (route, date, carrier)." });

    await kv.put(entryKey(route, date), JSON.stringify({ carrier, savedAt: new Date().toISOString() }));
    return json(200, { ok: true, data: await getAllByPrefix(kv, "rot:") });
  }

  if (request.method === "DELETE") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { route, date } = body;
    if (!route || !date) return json(400, { error: "Brak wymaganych pól (route, date)." });

    await kv.delete(entryKey(route, date));
    return json(200, { ok: true, data: await getAllByPrefix(kv, "rot:") });
  }

  return json(405, { error: "Method not allowed" });
}

// -------------------------------------------------------------
// /api/commissions — prowizje PURE per sobota (historia)
// -------------------------------------------------------------

async function handleCommissions(request, env) {
  const kv = env.WEEKEND_KV;
  const PASSWORD = env.WEEKEND_APP_PASSWORD;
  const entryKey = (date) => `comm:${date}`;

  if (request.method === "GET") {
    return json(200, await getAllByPrefix(kv, "comm:"));
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { date, rows, fileName } = body;
    if (!date || !Array.isArray(rows)) return json(400, { error: "Brak wymaganych pól (date, rows[])." });

    await kv.put(
      entryKey(date),
      JSON.stringify({ rows, fileName: fileName || null, uploadedAt: new Date().toISOString() })
    );
    return json(200, { ok: true, data: await getAllByPrefix(kv, "comm:") });
  }

  if (request.method === "DELETE") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { date } = body;
    if (!date) return json(400, { error: "Brak wymaganego pola (date)." });

    await kv.delete(entryKey(date));
    return json(200, { ok: true, data: await getAllByPrefix(kv, "comm:") });
  }

  return json(405, { error: "Method not allowed" });
}

// -------------------------------------------------------------
// /api/dniowka-rates — stawki dniowki per trasa
// -------------------------------------------------------------

async function handleDniowkaRates(request, env) {
  const kv = env.WEEKEND_KV;
  const PASSWORD = env.WEEKEND_APP_PASSWORD;
  const KEY = "rates:current";

  if (request.method === "GET") {
    return json(200, (await kv.get(KEY, { type: "json" })) || {});
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (PASSWORD && body.password !== PASSWORD) return json(401, { error: "Nieprawidłowe hasło." });

    const { rates } = body;
    if (!rates || typeof rates !== "object") {
      return json(400, { error: "Brak wymaganego pola (rates: {trasa: kwota})." });
    }

    await kv.put(KEY, JSON.stringify(rates));
    return json(200, { ok: true, data: rates });
  }

  return json(405, { error: "Method not allowed" });
}

// -------------------------------------------------------------
// Router
// -------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: HEADERS });
    }

    try {
      if (url.pathname === "/api/declarations") return await handleDeclarations(request, env);
      if (url.pathname === "/api/rotation-overrides") return await handleRotationOverrides(request, env);
      if (url.pathname === "/api/commissions") return await handleCommissions(request, env);
      if (url.pathname === "/api/dniowka-rates") return await handleDniowkaRates(request, env);
    } catch (err) {
      return json(500, { error: "Błąd serwera: " + (err && err.message ? err.message : String(err)) });
    }

    // Wszystko poza /api/* obsluguje binding ASSETS (statyczne pliki)
    return env.ASSETS.fetch(request);
  },
};
