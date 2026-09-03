// =============================================================
// Netlify Function: stawki dniówki per trasa (edytowalne w apce)
// Jeden aktualny zestaw stawek (bez historii - stawki kontraktowe,
// rzadko sie zmieniaja).
// =============================================================

const { connectLambda, getStore } = require("@netlify/blobs");

const PASSWORD = process.env.WEEKEND_APP_PASSWORD;
const STORE_NAME = "weekend-dniowka-rates";
const KEY = "current";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

      const { rates } = body;
      if (!rates || typeof rates !== "object") {
        return json(400, { error: "Brak wymaganego pola (rates: {trasa: kwota})." });
      }

      await store.setJSON(KEY, rates);
      return json(200, { ok: true, data: rates });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: "Błąd serwera: " + (err && err.message ? err.message : String(err)) });
  }
};
