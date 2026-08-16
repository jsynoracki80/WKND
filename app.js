// =============================================================
// Trasy Weekendowe — logika aplikacji
// © 2026 Jacek Synoracki — Oddział Słupsk
// =============================================================

const ROTATING_ROUTES = ["N", "S", "P", "U", "G"];
const STORAGE_KEY = "trasy_weekendowe_deklaracje_v1";

let COURIERS_BY_CARRIER = {};
let ADDRESSES = [];
let ROUTE_CARRIERS = {};
let ROTATION = {};

const dateInput = document.getElementById("date-input");
const dateWarning = document.getElementById("date-warning");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const emptyHint = document.getElementById("empty-hint");
const declaredSummary = document.getElementById("declared-summary");
const declaredListEl = document.getElementById("declared-list");
const summaryDateEl = document.getElementById("summary-date");

// -------------------------------------------------------------
// Inicjalizacja
// -------------------------------------------------------------

async function init() {
  const [couriers, addresses, routeCarriers, rotation] = await Promise.all([
    fetchJSON("data/couriers.json"),
    fetchJSON("data/addresses.json"),
    fetchJSON("data/route_carriers.json"),
    fetchJSON("data/rotation.json"),
  ]);

  COURIERS_BY_CARRIER = couriers;
  ADDRESSES = addresses;
  ROUTE_CARRIERS = routeCarriers;
  ROTATION = rotation;

  dateInput.value = nextSaturdayISO();
  dateInput.addEventListener("change", () => {
    validateDate();
    renderResults();
    renderSummary();
  });

  searchInput.addEventListener("input", () => {
    renderResults();
  });

  validateDate();
  renderResults();
  renderSummary();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

async function fetchJSON(path) {
  const res = await fetch(path);
  return res.json();
}

// -------------------------------------------------------------
// Daty
// -------------------------------------------------------------

function nextSaturdayISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = (6 - day + 7) % 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + diff);
  return toISO(sat);
}

function toISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSaturday(iso) {
  const dt = new Date(iso + "T00:00:00");
  return dt.getDay() === 6;
}

function fmtDatePL(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function validateDate() {
  const ok = isSaturday(dateInput.value);
  dateWarning.classList.toggle("hidden", ok);
}

// -------------------------------------------------------------
// Logika tras / rotacji
// -------------------------------------------------------------

function resolveCarriersForRoute(route, dateISO) {
  if (ROTATING_ROUTES.includes(route)) {
    const entry = ROTATION[route] && ROTATION[route][dateISO];
    if (entry) {
      return { carriers: [entry.carrier], label: entry.label, flagged: entry.flagged, inSchedule: true };
    }
    return { carriers: ROUTE_CARRIERS[route] || [], label: null, flagged: false, inSchedule: false };
  }
  return { carriers: ROUTE_CARRIERS[route] || [], label: null, flagged: false, inSchedule: true };
}

function couriersForCarriers(carrierNames) {
  const seen = new Set();
  const list = [];
  carrierNames.forEach((c) => {
    (COURIERS_BY_CARRIER[c] || []).forEach((k) => {
      if (!seen.has(k.nr)) {
        seen.add(k.nr);
        list.push({ ...k, carrier: c });
      }
    });
  });
  return list;
}

// -------------------------------------------------------------
// Deklaracje (localStorage)
// -------------------------------------------------------------

function loadDeclarations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDeclarations(decl) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decl));
}

function declKey(route, dateISO) {
  return `${route}__${dateISO}`;
}

function declareCourier(route, dateISO, courier) {
  const decl = loadDeclarations();
  decl[declKey(route, dateISO)] = courier;
  saveDeclarations(decl);
  renderResults();
  renderSummary();
}

function removeDeclaration(route, dateISO) {
  const decl = loadDeclarations();
  delete decl[declKey(route, dateISO)];
  saveDeclarations(decl);
  renderResults();
  renderSummary();
}

// -------------------------------------------------------------
// Render: wyniki wyszukiwania
// -------------------------------------------------------------

function renderResults() {
  const q = searchInput.value.trim().toLowerCase();
  const dateISO = dateInput.value;
  resultsEl.innerHTML = "";

  if (!q) {
    emptyHint.classList.remove("hidden");
    return;
  }
  emptyHint.classList.add("hidden");

  const matches = ADDRESSES.filter((a) => {
    return (
      a.apm.toLowerCase().includes(q) ||
      (a.adres || "").toLowerCase().includes(q) ||
      (a.miasto || "").toLowerCase().includes(q) ||
      (a.kod || "").toLowerCase().includes(q)
    );
  }).slice(0, 40);

  if (matches.length === 0) {
    const div = document.createElement("div");
    div.className = "empty-hint";
    div.textContent = `Brak wyników dla „${searchInput.value.trim()}”.`;
    resultsEl.appendChild(div);
    return;
  }

  const decl = loadDeclarations();

  matches.forEach((r, idx) => {
    resultsEl.appendChild(buildResultCard(r, idx, dateISO, decl));
  });
}

function buildResultCard(r, idx, dateISO, decl) {
  const { carriers, label, flagged, inSchedule } = resolveCarriersForRoute(r.trasa, dateISO);
  const isRotating = ROTATING_ROUTES.includes(r.trasa);
  const options = couriersForCarriers(carriers);
  const existing = decl[declKey(r.trasa, dateISO)];
  const cardId = `card-${r.trasa}-${idx}`;

  const card = document.createElement("div");
  card.className = "result-card";
  card.id = cardId;

  card.innerHTML = `
    <div class="result-head">
      <span class="route-badge">${r.trasa}</span>
      <span class="result-addr">${escapeHTML(r.adres || r.apm)}</span>
    </div>
    <div class="result-meta">📍 ${escapeHTML(r.miasto || "")} ${escapeHTML(r.kod || "")} · APM ${escapeHTML(r.apm)} ${r.kwadrant ? "· " + escapeHTML(r.kwadrant) : ""}</div>
    <div class="result-body">
      <div class="carrier-line">
        Przewoźnik ${isRotating ? "(rotacja)" : "(stały)"}:
        <strong>${escapeHTML(carriers.length === 1 ? carriers[0] : carriers.join(" / "))}</strong>
        ${label ? `<span style="color:#9186A0"> (${escapeHTML(label)})</span>` : ""}
      </div>
      ${!inSchedule ? `<div class="warning">⚠️ Data poza znanym grafikiem rotacji (18.07.2026–02.01.2027). Pokazano ostatnią znaną pulę przewoźników.</div>` : ""}
      ${flagged ? `<div class="warning danger">⚠️ Ten przewoźnik („Bielecki” / CAR-TRANS Oliwia Lubert) nie występuje na liście stałych przewoźników trasy G — do potwierdzenia.</div>` : ""}
      ${carriers.length > 1 && !isRotating ? `<div class="warning">⚠️ Niejednoznaczny przewoźnik źródłowy („DOMAROS”) — wybierz właściwego kuriera ręcznie.</div>` : ""}
      <div class="declare-slot"></div>
    </div>
  `;

  const slot = card.querySelector(".declare-slot");
  renderDeclareSlot(slot, r, dateISO, existing, options, carriers.length > 1);

  return card;
}

function renderDeclareSlot(slot, r, dateISO, existing, options, showCarrierInLabel) {
  slot.innerHTML = "";

  if (existing) {
    const box = document.createElement("div");
    box.className = "declared-box";
    box.innerHTML = `
      <span class="declared-name">✅ ${escapeHTML(existing.courierName)} (${escapeHTML(existing.courierNr)})</span>
    `;
    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.textContent = "✕";
    btn.addEventListener("click", () => removeDeclaration(r.trasa, dateISO));
    box.appendChild(btn);
    slot.appendChild(box);
    return;
  }

  if (slot.dataset.open === "1") {
    const select = document.createElement("select");
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.disabled = true;
    emptyOpt.selected = true;
    emptyOpt.textContent = "Wybierz kuriera…";
    select.appendChild(emptyOpt);

    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.nr;
      opt.textContent = `${o.imie} ${o.nazwisko} (${o.nr})${showCarrierInLabel ? " — " + o.carrier : ""}`;
      select.appendChild(opt);
    });

    select.addEventListener("change", (e) => {
      const opt = options.find((o) => o.nr === e.target.value);
      if (opt) {
        declareCourier(r.trasa, dateISO, {
          courierNr: opt.nr,
          courierName: `${opt.imie} ${opt.nazwisko}`,
          carrier: opt.carrier,
        });
      }
    });

    slot.appendChild(select);

    if (options.length === 0) {
      const warn = document.createElement("div");
      warn.style.cssText = "font-size:12px;color:#B3261E;margin-top:6px;";
      warn.textContent = "Brak znanych kurierów dla tego przewoźnika w bazie.";
      slot.appendChild(warn);
    }
    return;
  }

  const btn = document.createElement("button");
  btn.className = "declare-btn";
  btn.textContent = "👤 Zadeklaruj kuriera";
  btn.addEventListener("click", () => {
    slot.dataset.open = "1";
    renderDeclareSlot(slot, r, dateISO, existing, options, showCarrierInLabel);
  });
  slot.appendChild(btn);
}

// -------------------------------------------------------------
// Render: podsumowanie zadeklarowanych kurierów
// -------------------------------------------------------------

function renderSummary() {
  const dateISO = dateInput.value;
  const decl = loadDeclarations();
  const entries = Object.entries(decl)
    .filter(([k]) => k.endsWith("__" + dateISO))
    .map(([k, v]) => ({ route: k.split("__")[0], ...v }));

  if (entries.length === 0) {
    declaredSummary.classList.add("hidden");
    return;
  }

  declaredSummary.classList.remove("hidden");
  summaryDateEl.textContent = `sobota ${fmtDatePL(dateISO)}`;
  declaredListEl.innerHTML = "";

  entries
    .sort((a, b) => a.route.localeCompare(b.route))
    .forEach((d) => {
      const row = document.createElement("div");
      row.className = "summary-row";
      row.innerHTML = `
        <span><span class="summary-route">Trasa ${escapeHTML(d.route)}</span> — ${escapeHTML(d.courierName)} (${escapeHTML(d.courierNr)})</span>
      `;
      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.textContent = "✕";
      btn.addEventListener("click", () => removeDeclaration(d.route, dateISO));
      row.appendChild(btn);
      declaredListEl.appendChild(row);
    });
}

// -------------------------------------------------------------
// Utils
// -------------------------------------------------------------

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

init();
