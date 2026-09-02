// =============================================================
// Netlify Function: ręczne zamiany kolejności rotacji (N/S/P/U/G)
// Każda zamiana (trasa+data) ma WŁASNY, niezależny klucz.
// =============================================================

const { connectLambda, getStore } = require("@netlify/blobs");

const PASSWORD = process.env.WEEKEND_APP_PASSWORD;
const STORE_NAME = "weekend-rotation-overrides";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

function entryKey(route, date) {
  return `${route}__${date}`;
}

async function getAllEntries(store) {
  const { blobs } = await store.list();
  const entries = await Promise.all(
    blobs.map(async (b) => {
      const value = await store.get(b.key, { type: "json" });
      return [b.key, value];
    })
  );
  const result = {};
  entries.forEach(([key, value]) => {
    if (value != null) result[key] = value;
  });
  return result;
}

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore(STORE_NAME);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const data = await getAllEntries(store);
      return json(200, data);
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      if (PASSWORD && body.password !== PASSWORD) {
        return json(401, { error: "Nieprawidłowe hasło." });
      }

      const { route, date, carrier } = body;
      if (!route || !date || !carrier) {
        return json(400, { error: "Brak wymaganych pól (route, date, carrier)." });
      }

      await store.setJSON(entryKey(route, date), {
        carrier,
        savedAt: new Date().toISOString(),
      });

      const data = await getAllEntries(store);
      return json(200, { ok: true, data });
    }

    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");

      if (PASSWORD && body.password !== PASSWORD) {
        return json(401, { error: "Nieprawidłowe hasło." });
      }

      const { route, date } = body;
      if (!route || !date) {
        return json(400, { error: "Brak wymaganych pól (route, date)." });
      }

      await store.delete(entryKey(route, date));

      const data = await getAllEntries(store);
      return json(200, { ok: true, data });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: "Błąd serwera: " + (err && err.message ? err.message : String(err)) });
  }
};
