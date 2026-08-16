// =============================================================
// Trasy Weekendowe — logika aplikacji
// © 2026 Jacek Synoracki — Oddział Słupsk
// Dane deklaracji/rotacji: Netlify Functions + Blobs (trwałe,
// wspólne dla wszystkich urządzeń).
// =============================================================

const ALL_ROUTES = ["A","B","C","D","F","G","J","K","M","N","P","Q","S","T","U","V","W","X"];
const ROTATING_ROUTES = ["N", "S", "P", "U", "G"];
const MERGED_LABELS = {
  F: "DOMAROS (Czesław + Sebastian)",
};

const API_BASE = "/.netlify/functions";
const PASSWORD_STORAGE_KEY = "trasy_weekendowe_haslo_v1";

let COURIERS_BY_CARRIER = {};
let ADDRESSES = [];
let ROUTE_CARRIERS = {};
let ROTATION = {};
let ROTATION_POOLS = {};
let ADDRESSES_BY_ROUTE = {};
let FLAT_COURIERS = [];
let KNOWN_CITIES = [];
const DEFAULT_CITY = "Słupsk";

let DECLARATIONS = {};       // route__date -> {courierNr, courierName, carrier, savedAt}
let ROTATION_OVERRIDES = {}; // route__date -> {carrier, savedAt}
let PASSWORD = localStorage.getItem(PASSWORD_STORAGE_KEY) || "";
let BACKEND_OK = true;

const expandedRoutes = new Set();   // top-level route card open/closed
const sectionState = new Map();     // "route::section" -> bool (overrides default)
const swapSearchOpen = new Set();   // route__date keys where "inny kurier" search is open

const dateInput = document.getElementById("date-input");
const dateWarning = document.getElementById("date-warning");
const searchInput = document.getElementById("search-input");
const micBtn = document.getElementById("mic-btn");
const voiceFeedback = document.getElementById("voice-feedback");
const voiceUnsupported = document.getElementById("voice-unsupported");
const resultsEl = document.getElementById("results");
const allRoutesEl = document.getElementById("all-routes");
const historyEl = document.getElementById("history");
const historyEmptyEl = document.getElementById("history-empty");
const declaredSummary = document.getElementById("declared-summary");
const declaredListEl = document.getElementById("declared-list");
const summaryDateEl = document.getElementById("summary-date");
const loadingBanner = document.getElementById("loading-banner");
const syncErrorBanner = document.getElementById("sync-error-banner");
const settingsToggle = document.getElementById("settings-toggle");
const settingsBody = document.getElementById("settings-body");
const settingsChevron = document.getElementById("settings-chevron");
const passwordInput = document.getElementById("password-input");

// -------------------------------------------------------------
// Inicjalizacja
// -------------------------------------------------------------

async function init() {
  passwordInput.value = PASSWORD;
  passwordInput.addEventListener("change", () => {
    PASSWORD = passwordInput.value;
    localStorage.setItem(PASSWORD_STORAGE_KEY, PASSWORD);
  });

  settingsToggle.addEventListener("click", () => {
    settingsBody.classList.toggle("hidden");
    settingsChevron.classList.toggle("open");
  });

  const [couriers, addresses, routeCarriers, rotation, rotationPools] = await Promise.all([
    fetchJSON("data/couriers.json"),
    fetchJSON("data/addresses.json"),
    fetchJSON("data/route_carriers.json"),
    fetchJSON("data/rotation.json"),
    fetchJSON("data/rotation_pools.json"),
  ]);

  COURIERS_BY_CARRIER = couriers;
  ADDRESSES = addresses;
  ROUTE_CARRIERS = routeCarriers;
  ROTATION = rotation;
  ROTATION_POOLS = rotationPools;

  ADDRESSES_BY_ROUTE = {};
  ADDRESSES.forEach((a) => {
    if (!ADDRESSES_BY_ROUTE[a.trasa]) ADDRESSES_BY_ROUTE[a.trasa] = [];
    ADDRESSES_BY_ROUTE[a.trasa].push(a);
  });

  FLAT_COURIERS = buildFlatCourierIndex();
  KNOWN_CITIES = buildKnownCities();

  dateInput.value = nextSaturdayISO();
  dateInput.addEventListener("change", () => {
    validateDate();
    renderAll();
  });

  searchInput.addEventListener("input", () => renderSearchResults());
  setupVoiceSearch();

  await refreshFromBackend();

  validateDate();
  loadingBanner.classList.add("hidden");
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

async function fetchJSON(path) {
  const res = await fetch(path);
  return res.json();
}

function buildFlatCourierIndex() {
  const list = [];
  const seen = new Set();
  Object.entries(COURIERS_BY_CARRIER).forEach(([carrier, arr]) => {
    arr.forEach((k) => {
      if (!seen.has(k.nr)) {
        seen.add(k.nr);
        list.push({ ...k, carrier });
      }
    });
  });
  list.sort((a, b) => (a.nazwisko || "").localeCompare(b.nazwisko || "", "pl"));
  return list;
}

// -------------------------------------------------------------
// Wyszukiwanie glosowe
// -------------------------------------------------------------

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // usuwa polskie znaki diakrytyczne do porownania
}

function buildKnownCities() {
  const set = new Set();
  ADDRESSES.forEach((a) => {
    if (a.miasto) set.add(a.miasto.trim());
  });
  return [...set];
}

function transcriptMentionsCity(transcript) {
  const norm = normalizeText(transcript);
  return KNOWN_CITIES.some((city) => norm.includes(normalizeText(city)));
}

function setupVoiceSearch() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    micBtn.classList.add("hidden");
    voiceUnsupported.classList.remove("hidden");
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "pl-PL";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  recognition.addEventListener("start", () => {
    listening = true;
    micBtn.classList.add("listening");
    voiceFeedback.classList.remove("hidden");
    voiceFeedback.textContent = "🎤 Słucham…";
  });

  recognition.addEventListener("end", () => {
    listening = false;
    micBtn.classList.remove("listening");
  });

  recognition.addEventListener("error", (e) => {
    listening = false;
    micBtn.classList.remove("listening");
    voiceFeedback.textContent = "⚠️ Nie udało się rozpoznać mowy (" + e.error + "). Spróbuj ponownie.";
  });

  recognition.addEventListener("result", (event) => {
    let transcript = (event.results[0][0].transcript || "").trim();
    if (!transcript) return;

    const hadCity = transcriptMentionsCity(transcript);
    if (!hadCity) {
      transcript = `${transcript} ${DEFAULT_CITY}`;
    }

    searchInput.value = transcript;
    renderSearchResults();

    voiceFeedback.textContent = hadCity
      ? `🎤 Rozpoznano: „${transcript}”`
      : `🎤 Rozpoznano: „${transcript}” (nie podano miasta — domyślnie dodano „${DEFAULT_CITY}”)`;
  });

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch {
      // recognition already running - ignore
    }
  });
}

// -------------------------------------------------------------
// Backend (Netlify Functions + Blobs)
// -------------------------------------------------------------

async function refreshFromBackend() {
  try {
    const [decl, rot] = await Promise.all([
      fetch(`${API_BASE}/declarations`).then((r) => r.json()),
      fetch(`${API_BASE}/rotation-overrides`).then((r) => r.json()),
    ]);
    DECLARATIONS = decl && typeof decl === "object" ? decl : {};
    ROTATION_OVERRIDES = rot && typeof rot === "object" ? rot : {};
    BACKEND_OK = true;
    syncErrorBanner.classList.add("hidden");
  } catch (err) {
    BACKEND_OK = false;
    showSyncError("Nie udało się połączyć z serwerem zapisu. Deklaracje mogą się nie zapisać — sprawdź połączenie i spróbuj ponownie.");
  }
}

function showSyncError(msg) {
  syncErrorBanner.textContent = "⚠️ " + msg;
  syncErrorBanner.classList.remove("hidden");
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, password: PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Błąd zapisu (${res.status})`);
  }
  return data;
}

async function apiDelete(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, password: PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Błąd usuwania (${res.status})`);
  }
  return data;
}

function renderAll() {
  renderRoutesList();
  renderHistory();
  renderSearchResults();
  renderSummary();
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

function todayISO() {
  return toISO(new Date());
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
// Rotacja: harmonogram + reczna zamiana kolejnosci
// -------------------------------------------------------------

function rotKey(route, dateISO) {
  return `${route}__${dateISO}`;
}

function getRotationOverride(route, dateISO) {
  const entry = ROTATION_OVERRIDES[rotKey(route, dateISO)];
  return entry ? entry.carrier : null;
}

async function setRotationOverride(route, dateISO, carrier) {
  const data = await apiPost("rotation-overrides", { route, date: dateISO, carrier });
  ROTATION_OVERRIDES = data.data || ROTATION_OVERRIDES;
}

async function clearRotationOverride(route, dateISO) {
  const data = await apiDelete("rotation-overrides", { route, date: dateISO });
  ROTATION_OVERRIDES = data.data || ROTATION_OVERRIDES;
}

function effectiveCarrierInfo(route, dateISO) {
  const isRotating = ROTATING_ROUTES.includes(route);
  const override = isRotating ? getRotationOverride(route, dateISO) : null;

  if (override) {
    return { carriers: [override], label: null, inSchedule: true, overridden: true, isRotating };
  }

  if (isRotating) {
    const entry = ROTATION[route] && ROTATION[route][dateISO];
    if (entry) {
      return { carriers: [entry.carrier], label: entry.label, inSchedule: true, overridden: false, isRotating };
    }
    return { carriers: ROUTE_CARRIERS[route] || [], label: null, inSchedule: false, overridden: false, isRotating };
  }

  return { carriers: ROUTE_CARRIERS[route] || [], label: null, inSchedule: true, overridden: false, isRotating };
}

function carrierDisplayName(route, carriers) {
  if (MERGED_LABELS[route]) return MERGED_LABELS[route];
  return carriers.join(" / ");
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
// Deklaracje kuriera (backend)
// -------------------------------------------------------------

function declKey(route, dateISO) {
  return `${route}__${dateISO}`;
}

async function declareCourier(route, dateISO, courier) {
  const data = await apiPost("declarations", { route, date: dateISO, ...courier });
  DECLARATIONS = data.data || DECLARATIONS;
}

async function removeDeclaration(route, dateISO) {
  const data = await apiDelete("declarations", { route, date: dateISO });
  DECLARATIONS = data.data || DECLARATIONS;
}

// -------------------------------------------------------------
// Sekcje (accordion) — stan otwarcia
// -------------------------------------------------------------

function isSectionOpen(key, defaultVal) {
  return sectionState.has(key) ? sectionState.get(key) : defaultVal;
}

function toggleSection(key, defaultVal) {
  sectionState.set(key, !isSectionOpen(key, defaultVal));
}

function buildAccordion(key, titleHTML, summaryText, defaultOpen, bodyBuilderFn) {
  const open = isSectionOpen(key, defaultOpen);

  const acc = document.createElement("div");
  acc.className = "accordion";

  const head = document.createElement("div");
  head.className = "accordion-head";
  head.innerHTML = `
    <span class="accordion-title">${titleHTML}</span>
    <span class="accordion-summary">${escapeHTML(summaryText || "")}</span>
    <span class="chevron ${open ? "open" : ""}">▶</span>
  `;
  head.addEventListener("click", () => {
    toggleSection(key, defaultOpen);
    renderRoutesList();
  });

  const body = document.createElement("div");
  body.className = `accordion-body ${open ? "" : "hidden"}`;
  if (open) body.appendChild(bodyBuilderFn());

  acc.appendChild(head);
  acc.appendChild(body);
  return acc;
}

// -------------------------------------------------------------
// Render: lista wszystkich tras
// -------------------------------------------------------------

function renderRoutesList() {
  const dateISO = dateInput.value;
  allRoutesEl.innerHTML = "";

  ALL_ROUTES.forEach((route) => {
    allRoutesEl.appendChild(buildRouteCard(route, dateISO));
  });
}

function buildRouteCard(route, dateISO) {
  const info = effectiveCarrierInfo(route, dateISO);
  const carrierLabel = carrierDisplayName(route, info.carriers);
  const declared = DECLARATIONS[declKey(route, dateISO)];
  const isOpen = expandedRoutes.has(route);

  const card = document.createElement("div");
  card.className = "route-card";
  card.id = `route-${route}`;

  const head = document.createElement("div");
  head.className = "route-card-head";
  head.innerHTML = `
    <span class="route-badge-lg">${route}</span>
    <div class="route-head-info">
      <div class="route-head-carrier">${escapeHTML(carrierLabel)}${info.overridden ? '<span class="override-badge">zamiana kolejki</span>' : ""}</div>
      <div class="route-head-status ${declared ? "ok" : ""}">${declared ? "✅ " + escapeHTML(declared.courierName) : "brak zadeklarowanego kuriera"}</div>
    </div>
    <span class="chevron ${isOpen ? "open" : ""}">▶</span>
  `;
  head.addEventListener("click", () => {
    if (expandedRoutes.has(route)) expandedRoutes.delete(route);
    else expandedRoutes.add(route);
    renderRoutesList();
  });

  const body = document.createElement("div");
  body.className = `route-card-body ${isOpen ? "" : "hidden"}`;
  if (isOpen) {
    body.appendChild(buildRouteCardBody(route, dateISO, info, declared));
  }

  card.appendChild(head);
  card.appendChild(body);
  return card;
}

function buildRouteCardBody(route, dateISO, info, declared) {
  const wrap = document.createElement("div");
  wrap.style.paddingTop = "10px";

  // === 1. KURIER — pierwsze, najważniejsze ===
  const courierKey = `${route}::courier`;
  const courierSummary = declared ? declared.courierName : "brak deklaracji";
  wrap.appendChild(
    buildAccordion(courierKey, "👤 Kurier na tę trasę", courierSummary, !declared, () => {
      const box = document.createElement("div");
      renderCourierSlot(box, route, dateISO, info, declared);
      return box;
    })
  );

  // === 2. ROTACJA (tylko trasy N/S/P/U/G) ===
  if (info.isRotating) {
    const rotKeyName = `${route}::rotation`;
    const rotSummary = info.overridden ? "zamieniono" : "wg grafiku";
    wrap.appendChild(
      buildAccordion(rotKeyName, "🔁 Zamiana kolejności rotacji", rotSummary, false, () => {
        return buildRotationBody(route, dateISO, info);
      })
    );
  }

  // === 3. ADRESY — najmniej istotne, na końcu ===
  const addrs = ADDRESSES_BY_ROUTE[route] || [];
  if (addrs.length) {
    const addrKey = `${route}::addresses`;
    wrap.appendChild(
      buildAccordion(addrKey, "📍 Przykładowe adresy", `${addrs.length} adresów`, false, () => {
        const chipWrap = document.createElement("div");
        addrs.slice(0, 8).forEach((a) => {
          const chip = document.createElement("span");
          chip.className = "address-chip";
          chip.textContent = `${a.adres || a.apm}, ${a.miasto}`;
          chipWrap.appendChild(chip);
        });
        return chipWrap;
      })
    );
  }

  return wrap;
}

function buildRotationBody(route, dateISO, info) {
  const wrap = document.createElement("div");
  const pool = ROTATION_POOLS[route] || [];

  const select = document.createElement("select");
  const autoOpt = document.createElement("option");
  autoOpt.value = "";
  autoOpt.textContent = "Wg grafiku rotacji (domyślnie)";
  select.appendChild(autoOpt);
  pool.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
  select.value = info.overridden ? info.carriers[0] : "";
  select.disabled = !BACKEND_OK;

  select.addEventListener("change", async (e) => {
    const val = e.target.value;
    select.disabled = true;
    try {
      if (val === "") {
        await clearRotationOverride(route, dateISO);
      } else {
        await setRotationOverride(route, dateISO, val);
      }
      renderAll();
    } catch (err) {
      alert(err.message || "Nie udało się zapisać zamiany rotacji.");
      select.disabled = false;
    }
  });

  wrap.appendChild(select);

  if (info.overridden) {
    const note = document.createElement("div");
    note.style.cssText = "font-size:11.5px;color:#9A5B12;margin-top:5px;";
    note.textContent = "Zamieniono kolejność rotacji ręcznie dla tej soboty.";
    wrap.appendChild(note);
  }
  if (!BACKEND_OK) {
    const note = document.createElement("div");
    note.style.cssText = "font-size:11px;color:#B3261E;margin-top:5px;";
    note.textContent = "Brak połączenia z serwerem — zamiana rotacji chwilowo niedostępna.";
    wrap.appendChild(note);
  }
  return wrap;
}

function renderCourierSlot(slot, route, dateISO, info, declared) {
  slot.innerHTML = "";

  if (declared) {
    const isSwap = declared.carrier && !info.carriers.includes(declared.carrier);
    const box = document.createElement("div");
    box.className = "declared-box";
    box.innerHTML = `
      <span class="declared-name">✅ ${escapeHTML(declared.courierName)} (${escapeHTML(declared.courierNr)})${isSwap ? '<span class="swap-badge">zamiana</span>' : ""}</span>
    `;
    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.textContent = "✕";
    btn.disabled = !BACKEND_OK;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await removeDeclaration(route, dateISO);
        renderAll();
      } catch (err) {
        alert(err.message || "Nie udało się usunąć deklaracji.");
        btn.disabled = false;
      }
    });
    box.appendChild(btn);
    slot.appendChild(box);
    if (isSwap) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:11px;color:#6A2E9E;margin-top:5px;";
      note.textContent = `Normalnie ta trasa jest obsługiwana przez: ${carrierDisplayName(route, info.carriers)}.`;
      slot.appendChild(note);
    }
    return;
  }

  if (!BACKEND_OK) {
    const warn = document.createElement("div");
    warn.className = "warning danger";
    warn.textContent = "⚠️ Brak połączenia z serwerem zapisu — deklaracje chwilowo niedostępne.";
    slot.appendChild(warn);
  }

  const quickOptions = couriersForCarriers(info.carriers);
  const swapKey = declKey(route, dateISO);
  const isSwapOpen = swapSearchOpen.has(swapKey);

  const quickSelect = document.createElement("select");
  quickSelect.disabled = !BACKEND_OK;
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.disabled = true;
  emptyOpt.selected = true;
  emptyOpt.textContent = quickOptions.length ? "Wybierz kuriera przewoźnika…" : "Brak kurierów tego przewoźnika w bazie";
  quickSelect.appendChild(emptyOpt);
  quickOptions.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.nr;
    opt.textContent = `${o.imie} ${o.nazwisko} (${o.nr})`;
    quickSelect.appendChild(opt);
  });
  quickSelect.addEventListener("change", async (e) => {
    const opt = quickOptions.find((o) => o.nr === e.target.value);
    if (!opt) return;
    quickSelect.disabled = true;
    try {
      await declareCourier(route, dateISO, {
        courierNr: opt.nr,
        courierName: `${opt.imie} ${opt.nazwisko}`,
        carrier: opt.carrier,
      });
      renderAll();
    } catch (err) {
      alert(err.message || "Nie udało się zapisać deklaracji.");
      quickSelect.disabled = false;
    }
  });
  slot.appendChild(quickSelect);

  const toggle = document.createElement("button");
  toggle.className = "link-btn";
  toggle.textContent = isSwapOpen ? "Zamknij zamianę" : "Inny kurier (zamiana z innej trasy)";
  toggle.style.marginTop = "8px";
  toggle.addEventListener("click", () => {
    if (isSwapOpen) swapSearchOpen.delete(swapKey);
    else swapSearchOpen.add(swapKey);
    renderRoutesList();
  });
  slot.appendChild(toggle);

  if (isSwapOpen) {
    const swapWrap = document.createElement("div");
    swapWrap.style.marginTop = "8px";

    const searchBox = document.createElement("input");
    searchBox.type = "text";
    searchBox.placeholder = "Szukaj po nazwisku lub numerze kuriera…";
    swapWrap.appendChild(searchBox);

    const resultsBox = document.createElement("div");
    resultsBox.style.cssText = "margin-top:6px; max-height:220px; overflow-y:auto;";
    swapWrap.appendChild(resultsBox);

    function renderSwapResults() {
      const q = searchBox.value.trim().toLowerCase();
      resultsBox.innerHTML = "";
      if (!q) return;
      const matches = FLAT_COURIERS.filter(
        (c) =>
          (c.nazwisko || "").toLowerCase().includes(q) ||
          (c.imie || "").toLowerCase().includes(q) ||
          (c.nr || "").toLowerCase().includes(q)
      ).slice(0, 15);

      if (matches.length === 0) {
        const none = document.createElement("div");
        none.style.cssText = "font-size:12px;color:#9186A0;padding:6px 0;";
        none.textContent = "Brak wyników.";
        resultsBox.appendChild(none);
        return;
      }

      matches.forEach((m) => {
        const row = document.createElement("div");
        row.style.cssText =
          "padding:8px 9px; border-radius:8px; font-size:13px; cursor:pointer; border:1px solid #F0ECF6; margin-bottom:5px;";
        row.innerHTML = `<strong>${escapeHTML(m.imie)} ${escapeHTML(m.nazwisko)}</strong> (${escapeHTML(m.nr)})<br><span style="color:#9186A0;font-size:11.5px;">${escapeHTML(m.carrier)}</span>`;
        row.addEventListener("click", async () => {
          try {
            await declareCourier(route, dateISO, {
              courierNr: m.nr,
              courierName: `${m.imie} ${m.nazwisko}`,
              carrier: m.carrier,
            });
            swapSearchOpen.delete(swapKey);
            renderAll();
          } catch (err) {
            alert(err.message || "Nie udało się zapisać deklaracji.");
          }
        });
        resultsBox.appendChild(row);
      });
    }

    searchBox.addEventListener("input", renderSwapResults);
    swapWrap.style.display = BACKEND_OK ? "" : "none";
    slot.appendChild(swapWrap);
  }
}

// -------------------------------------------------------------
// Render: Historia (minione soboty)
// -------------------------------------------------------------

function renderHistory() {
  const today = todayISO();
  const byDate = {};

  Object.entries(DECLARATIONS).forEach(([key, val]) => {
    const [route, date] = key.split("__");
    if (date >= today) return; // tylko minione
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ route, ...val });
  });

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  historyEl.innerHTML = "";
  historyEmptyEl.classList.toggle("hidden", dates.length > 0);

  dates.forEach((date) => {
    const entries = byDate[date].sort((a, b) => a.route.localeCompare(b.route));
    const key = `hist::${date}`;
    const isOpen = sectionState.get(key) || false;

    const card = document.createElement("div");
    card.className = "history-card";

    const head = document.createElement("div");
    head.className = "history-head";
    head.innerHTML = `
      <div>
        <div class="history-date">Sobota ${fmtDatePL(date)}</div>
        <div class="history-count">${entries.length} ${entries.length === 1 ? "trasa" : "tras"} z kurierem</div>
      </div>
      <span class="chevron ${isOpen ? "open" : ""}">▶</span>
    `;
    head.addEventListener("click", () => {
      sectionState.set(key, !isOpen);
      renderHistory();
    });

    const body = document.createElement("div");
    body.className = `history-body ${isOpen ? "" : "hidden"}`;
    if (isOpen) {
      entries.forEach((e) => {
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `<span><strong style="color:var(--purple)">Trasa ${escapeHTML(e.route)}</strong> — ${escapeHTML(e.courierName)} (${escapeHTML(e.courierNr)})</span>`;
        body.appendChild(row);
      });

      const openBtn = document.createElement("button");
      openBtn.className = "history-open-btn";
      openBtn.textContent = `Otwórz tę sobotę w edytorze ↑`;
      openBtn.addEventListener("click", () => {
        dateInput.value = date;
        validateDate();
        renderAll();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      body.appendChild(openBtn);
    }

    card.appendChild(head);
    card.appendChild(body);
    historyEl.appendChild(card);
  });
}

// -------------------------------------------------------------
// Render: wyszukiwanie adresow (skrot do trasy)
// -------------------------------------------------------------

function addressMatchesQuery(a, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = `${a.apm} ${a.adres || ""} ${a.miasto || ""} ${a.kod || ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

function renderSearchResults() {
  const q = searchInput.value.trim().toLowerCase();
  resultsEl.innerHTML = "";
  if (!q) return;

  const matches = ADDRESSES.filter((a) => addressMatchesQuery(a, q)).slice(0, 30);

  if (matches.length === 0) {
    const div = document.createElement("div");
    div.className = "empty-hint";
    div.textContent = `Brak wyników dla „${searchInput.value.trim()}”.`;
    resultsEl.appendChild(div);
    return;
  }

  const dateISO = dateInput.value;

  matches.forEach((r) => {
    const info = effectiveCarrierInfo(r.trasa, dateISO);
    const declared = DECLARATIONS[declKey(r.trasa, dateISO)];

    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-head">
        <span class="route-badge">${r.trasa}</span>
        <span class="result-addr">${escapeHTML(r.adres || r.apm)}</span>
      </div>
      <div class="result-meta">📍 ${escapeHTML(r.miasto || "")} ${escapeHTML(r.kod || "")} · APM ${escapeHTML(r.apm)}</div>
      <div class="result-body">
        <div class="carrier-line">
          Przewoźnik: <strong>${escapeHTML(carrierDisplayName(r.trasa, info.carriers))}</strong>
        </div>
        <div class="carrier-line">
          Kurier: ${declared ? "✅ " + escapeHTML(declared.courierName) : "brak deklaracji"}
        </div>
        <a href="#route-${r.trasa}" class="jump-link">Otwórz trasę ${r.trasa} ↑</a>
      </div>
    `;
    card.querySelector(".jump-link").addEventListener("click", (e) => {
      e.preventDefault();
      expandedRoutes.add(r.trasa);
      renderRoutesList();
      requestAnimationFrame(() => {
        const target = document.getElementById(`route-${r.trasa}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.classList.add("route-flash");
          setTimeout(() => target.classList.remove("route-flash"), 1200);
        }
      });
    });
    resultsEl.appendChild(card);
  });
}

// -------------------------------------------------------------
// Render: podsumowanie zadeklarowanych kurierow (biezaca data)
// -------------------------------------------------------------

function renderSummary() {
  const dateISO = dateInput.value;
  const entries = Object.entries(DECLARATIONS)
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
      btn.addEventListener("click", async () => {
        try {
          await removeDeclaration(d.route, dateISO);
          renderAll();
        } catch (err) {
          alert(err.message || "Nie udało się usunąć deklaracji.");
        }
      });
      btn.textContent = "✕";
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
