// =============================================================
// Netlify Function: ręczne zamiany kolejności rotacji (N/S/P/U/G)
// =============================================================

const { connectLambda, getStore } = require("@netlify/blobs");

const PASSWORD = process.env.WEEKEND_APP_PASSWORD;
const STORE_NAME = "weekend-rotation-overrides";
const KEY = "all";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore(STORE_NAME);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const data = (await store.get(KEY, { type: "json" })) || {};
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

      const current = (await store.get(KEY, { type: "json" })) || {};
      current[`${route}__${date}`] = { carrier, savedAt: new Date().toISOString() };
      await store.setJSON(KEY, current);
      return json(200, { ok: true, data: current });
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

      const current = (await store.get(KEY, { type: "json" })) || {};
      delete current[`${route}__${date}`];
      await store.setJSON(KEY, current);
      return json(200, { ok: true, data: current });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: "Błąd serwera: " + (err && err.message ? err.message : String(err)) });
  }
};
