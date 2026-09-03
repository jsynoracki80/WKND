// =============================================================
// Trasy Weekendowe — logika aplikacji
// © 2026 Jacek Synoracki — Oddział Słupsk
// Dane deklaracji/rotacji/prowizji: Cloudflare Pages Functions + Workers KV.
// =============================================================

const ALL_ROUTES = ["A","B","C","D","F","G","J","K","M","N","P","Q","S","T","U","V","W","X"];
const ROTATING_ROUTES = ["N", "S", "P", "U", "G"];
const MERGED_LABELS = {
  F: "Domaros",
};

const CARRIER_ABBREV = {
  '" SZELTRANS" BARTŁOMIEJ SZELĄG': "Szeląg",
  "ANZA PAULINA ZYGOWSKA": "Szostak",
  "AZLTRANS Daniel Gąsiorek": "Daniel G.",
  "DAWID WÓDZ Trans": "Wódz D.",
  'FIRMA HANDLOWO-USŁUGOWA "MIKOTRANS" DAGOMIR GĄSIOREK': "Dagosz",
  "FIRMA USŁUGOWA KLAUDIA WIŚNIEWSKA": "Wojtas",
  'FIRMA USŁUGOWO TRANSPORTOWA "GREGOR" Grzegorz Kozioł': "Kozioł",
  "GALERIA PREZENTÓW STUDIO VIDEO EDIT GRZEGORZ KREFTA": "Krefta",
  'Gabinet Rozwoju Dziecka "JUSKAR" Anna Prokopowicz': "Prokopowicz",
  "JAKUB GIEC": "Giec",
  "JANUSZ WENTA STOLARSTWO - WENTA": "Hasiec",
  "KACPER KULPA": "Kulpa",
  "KAR-MAT PAULA KONDRACIUK": "Kondraciuk",
  "MAGDALENA LUBERT ITR": "Lubert",
  "Mechanika Pojazdowa - Serwis Mobilny - Wulkanizacja MKM Mateusz Konkel": "Konkel",
  "NIEZAPOMINAJKA PAULINA ŚWITALSKA": "Niezapominajka",
  "OPOS CARS  TOMASZ ROZENKRANC": "Opos",
  'PRZEDSIĘBIORSTWO HANDLOWO USŁUGOWE "GRUBE RYBY" TOMASZ SAWICKI': "Sawicki",
  "PRZEDSIĘBIORSTWO HANDLOWO USŁUGOWE Dorota Puławska": "Puławska",
  "PRZEMYSŁAW KUCZYŃSKI": "Kuczyński",
  "Patryk Wódz": "Wódz P.",
  "RYŚ-TRANS RYSZARD JANKOWSKI": "Jankowski",
  "TRANSMAD KRZYSZTOF MADURAJSKI": "Gumiś",
  "TRANSMO Marcin Orwat": "Orwat",
  "USŁUGI TRANSPORTOWE CZESŁAW DOMAROS": "Domaros",
  "USŁUGI TRANSPORTOWE SEBASTIAN DOMAROS": "Domaros",
  "POLTRANS Dominika Underlich": "Poltrans",
};

const API_BASE = "/api";
const PASSWORD_STORAGE_KEY = "trasy_weekendowe_haslo_v1";
const SEARCH_DEBOUNCE_MS = 200;

let COURIERS_BY_CARRIER = {};
let ADDRESSES = [];
let ROUTE_CARRIERS = {};
let ROTATION = {};
let ROTATION_POOLS = {};
let ADDRESSES_BY_ROUTE = {};
let FLAT_COURIERS = [];
let KNOWN_CITIES = [];
const DEFAULT_CITY = "Słupsk";

let DECLARATIONS = {};    // route__date -> kurier 1
let DECLARATIONS2 = {};   // route__date -> kurier 2 (opcjonalny)
let ROTATION_OVERRIDES = {};
let COMMISSIONS = {};     // data (YYYY-MM-DD) -> { rows:[{nr,imie,nazwisko,carrier,pureSum}], uploadedAt, fileName }
let DNIOWKA_RATES = {};   // trasa -> kwota
let PASSWORD = localStorage.getItem(PASSWORD_STORAGE_KEY) || "";
let BACKEND_OK = true;
let filterMissingOnly = false;
let searchDebounceTimer = null;

const expandedRoutes = new Set();
const sectionState = new Map();
const swapSearchOpen = new Set();
const secondSlotOpen = new Set(); // route__date - user otworzyl "dodaj drugiego kuriera"

const dateInput = document.getElementById("date-input");
const dateWarning = document.getElementById("date-warning");
const dateChips = document.querySelectorAll(".date-chip");
const searchInput = document.getElementById("search-input");
const micBtn = document.getElementById("mic-btn");
const voiceFeedback = document.getElementById("voice-feedback");
const voiceUnsupported = document.getElementById("voice-unsupported");
const allRoutesEl = document.getElementById("all-routes");
const noMatchHint = document.getElementById("no-match-hint");
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
const progressCount = document.getElementById("progress-count");
const progressBarFill = document.getElementById("progress-bar-fill");
const filterMissingCheckbox = document.getElementById("filter-missing");
const toastEl = document.getElementById("toast");

// Doplaty DOM
const doplatyDateLabel = document.getElementById("doplaty-date-label");
const commissionStatus = document.getElementById("commission-status");
const commissionFileInput = document.getElementById("commission-file-input");
const commissionUploadBtn = document.getElementById("commission-upload-btn");
const ratesToggle = document.getElementById("rates-toggle");
const ratesBody = document.getElementById("rates-body");
const ratesChevron = document.getElementById("rates-chevron");
const ratesGrid = document.getElementById("rates-grid");
const ratesSaveBtn = document.getElementById("rates-save-btn");
const doplatyTable = document.getElementById("doplaty-table");
const doplatyEmpty = document.getElementById("doplaty-empty");
const doplatyHistoryEl = document.getElementById("doplaty-history");
const doplatyHistoryEmpty = document.getElementById("doplaty-history-empty");

let toastHideTimer = null;
function showToast(msg, type = "info", duration = 1400) {
  clearTimeout(toastHideTimer);
  toastEl.textContent = msg;
  toastEl.className = `toast ${type}`;
  void toastEl.offsetWidth;
  toastHideTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, duration);
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}
const VIBRATE_OK = 25;
const VIBRATE_ERROR = [15, 60, 15];

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

  ratesToggle.addEventListener("click", () => {
    ratesBody.classList.toggle("hidden");
    ratesChevron.classList.toggle("open");
  });

  dateChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const offset = parseInt(chip.dataset.offset, 10);
      dateInput.value = saturdayWithOffsetISO(offset);
      validateDate();
      renderAll();
    });
  });

  filterMissingCheckbox.addEventListener("change", () => {
    filterMissingOnly = filterMissingCheckbox.checked;
    renderRoutesList();
  });

  commissionUploadBtn.addEventListener("click", () => commissionFileInput.click());
  commissionFileInput.addEventListener("change", handleCommissionFileSelected);
  ratesSaveBtn.addEventListener("click", saveDniowkaRates);

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

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => renderRoutesList(), SEARCH_DEBOUNCE_MS);
  });

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

function buildKnownCities() {
  const set = new Set();
  ADDRESSES.forEach((a) => {
    if (a.miasto) set.add(a.miasto.trim());
  });
  return [...set];
}

// -------------------------------------------------------------
// Backend (Cloudflare Pages Functions + Workers KV)
// -------------------------------------------------------------

function splitDeclarations(raw) {
  const primary = {};
  const secondary = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (k.endsWith("__2")) secondary[k.slice(0, -3)] = v;
    else primary[k] = v;
  });
  return { primary, secondary };
}

async function refreshFromBackend() {
  try {
    const [declRaw, rot, comm, rates] = await Promise.all([
      fetch(`${API_BASE}/declarations`).then((r) => r.json()),
      fetch(`${API_BASE}/rotation-overrides`).then((r) => r.json()),
      fetch(`${API_BASE}/commissions`).then((r) => r.json()),
      fetch(`${API_BASE}/dniowka-rates`).then((r) => r.json()),
    ]);
    const { primary, secondary } = splitDeclarations(declRaw);
    DECLARATIONS = primary;
    DECLARATIONS2 = secondary;
    ROTATION_OVERRIDES = rot && typeof rot === "object" ? rot : {};
    COMMISSIONS = comm && typeof comm === "object" ? comm : {};
    DNIOWKA_RATES = rates && typeof rates === "object" ? rates : {};
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
  if (!res.ok) throw new Error(data.error || `Błąd zapisu (${res.status})`);
  return data;
}

async function apiDelete(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, password: PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd usuwania (${res.status})`);
  return data;
}

function renderAll() {
  renderRoutesList();
  renderHistory();
  renderSummary();
  renderDoplaty();
  renderRatesGrid();
  renderDoplatyHistory();
}

// -------------------------------------------------------------
// Daty
// -------------------------------------------------------------

function nextSaturdayISO() {
  return saturdayWithOffsetISO(0);
}

function saturdayWithOffsetISO(weeksAhead) {
  const now = new Date();
  const day = now.getDay();
  const diff = (6 - day + 7) % 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + diff + weeksAhead * 7);
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

  dateChips.forEach((chip) => {
    const offset = parseInt(chip.dataset.offset, 10);
    chip.classList.toggle("active", saturdayWithOffsetISO(offset) === dateInput.value);
  });
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

function abbrevCarrier(fullName) {
  return CARRIER_ABBREV[fullName] || fullName;
}

function carrierDisplayName(route, carriers) {
  if (MERGED_LABELS[route]) return MERGED_LABELS[route];
  const abbrevs = [...new Set(carriers.map(abbrevCarrier))];
  return abbrevs.join(" / ");
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
// Deklaracje / rotacja — zapisy OPTYMISTYCZNE
// -------------------------------------------------------------

function declKey(route, dateISO) {
  return `${route}__${dateISO}`;
}

async function optimisticDeclare(route, dateISO, courier, slot = 1) {
  const key = declKey(route, dateISO);
  const map = slot === 2 ? DECLARATIONS2 : DECLARATIONS;
  const previous = map[key];

  if (slot === 2) DECLARATIONS2 = { ...DECLARATIONS2, [key]: courier };
  else DECLARATIONS = { ...DECLARATIONS, [key]: courier };
  refreshRouteCardInPlace(route);
  showToast("💾 Zapisywanie…", "info", 4000);

  try {
    const data = await apiPost("declarations", { route, date: dateISO, ...courier, slot });
    const { primary, secondary } = splitDeclarations(data.data);
    DECLARATIONS = primary;
    DECLARATIONS2 = secondary;
    vibrate(VIBRATE_OK);
    showToast("✅ Zapisano", "success");
  } catch (err) {
    if (slot === 2) {
      DECLARATIONS2 = { ...DECLARATIONS2 };
      if (previous) DECLARATIONS2[key] = previous;
      else delete DECLARATIONS2[key];
    } else {
      DECLARATIONS = { ...DECLARATIONS };
      if (previous) DECLARATIONS[key] = previous;
      else delete DECLARATIONS[key];
    }
    vibrate(VIBRATE_ERROR);
    showToast("⚠️ Nie zapisano — spróbuj ponownie", "error", 3000);
    alert("Nie udało się zapisać deklaracji: " + err.message + "\n\nSpróbuj ponownie.");
  }
  refreshRouteCardInPlace(route);
}

async function optimisticRemoveDeclaration(route, dateISO, slot = 1) {
  const key = declKey(route, dateISO);
  const map = slot === 2 ? DECLARATIONS2 : DECLARATIONS;
  const previous = map[key];

  if (slot === 2) {
    DECLARATIONS2 = { ...DECLARATIONS2 };
    delete DECLARATIONS2[key];
  } else {
    DECLARATIONS = { ...DECLARATIONS };
    delete DECLARATIONS[key];
  }
  refreshRouteCardInPlace(route);
  showToast("💾 Usuwanie…", "info", 4000);

  try {
    const data = await apiDelete("declarations", { route, date: dateISO, slot });
    const { primary, secondary } = splitDeclarations(data.data);
    DECLARATIONS = primary;
    DECLARATIONS2 = secondary;
    vibrate(VIBRATE_OK);
    showToast("✅ Usunięto", "success");
  } catch (err) {
    if (slot === 2) DECLARATIONS2 = { ...DECLARATIONS2, [key]: previous };
    else DECLARATIONS = { ...DECLARATIONS, [key]: previous };
    vibrate(VIBRATE_ERROR);
    showToast("⚠️ Nie usunięto — spróbuj ponownie", "error", 3000);
    alert("Nie udało się usunąć deklaracji: " + err.message + "\n\nSpróbuj ponownie.");
  }
  refreshRouteCardInPlace(route);
}

async function optimisticSetRotationOverride(route, dateISO, carrier) {
  const key = rotKey(route, dateISO);
  const previous = ROTATION_OVERRIDES[key];

  if (carrier) {
    ROTATION_OVERRIDES = { ...ROTATION_OVERRIDES, [key]: { carrier } };
  } else {
    ROTATION_OVERRIDES = { ...ROTATION_OVERRIDES };
    delete ROTATION_OVERRIDES[key];
  }
  refreshRouteCardInPlace(route);
  showToast("💾 Zapisywanie…", "info", 4000);

  try {
    const data = carrier
      ? await apiPost("rotation-overrides", { route, date: dateISO, carrier })
      : await apiDelete("rotation-overrides", { route, date: dateISO });
    ROTATION_OVERRIDES = data.data || ROTATION_OVERRIDES;
    vibrate(VIBRATE_OK);
    showToast("✅ Zapisano", "success");
  } catch (err) {
    ROTATION_OVERRIDES = { ...ROTATION_OVERRIDES };
    if (previous) ROTATION_OVERRIDES[key] = previous;
    else delete ROTATION_OVERRIDES[key];
    vibrate(VIBRATE_ERROR);
    showToast("⚠️ Nie zapisano — spróbuj ponownie", "error", 3000);
    alert("Nie udało się zapisać zamiany rotacji: " + err.message + "\n\nSpróbuj ponownie.");
  }
  refreshRouteCardInPlace(route);
}

// -------------------------------------------------------------
// Sekcje (accordion) — stan otwarcia
// -------------------------------------------------------------

function isSectionOpen(key, defaultVal) {
  return sectionState.has(key) ? sectionState.get(key) : defaultVal;
}

function toggleSection(key, defaultVal, route) {
  sectionState.set(key, !isSectionOpen(key, defaultVal));
  refreshRouteCardInPlace(route);
}

function buildAccordion(key, titleHTML, summaryText, defaultOpen, route, bodyBuilderFn) {
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
  head.addEventListener("click", () => toggleSection(key, defaultOpen, route));

  const body = document.createElement("div");
  body.className = `accordion-body ${open ? "" : "hidden"}`;
  if (open) body.appendChild(bodyBuilderFn());

  acc.appendChild(head);
  acc.appendChild(body);
  return acc;
}

// -------------------------------------------------------------
// Kurier(zy) na trasie — wspolny helper do wyswietlania
// -------------------------------------------------------------

function courierPairText(route, dateISO) {
  const key = declKey(route, dateISO);
  const p1 = DECLARATIONS[key];
  const p2 = DECLARATIONS2[key];
  if (!p1) return null;
  let text = p1.courierName;
  if (p2) text += ` + ${p2.courierName}`;
  return text;
}

// -------------------------------------------------------------
// Wyszukiwanie adresow (uzywane do filtrowania listy tras)
// -------------------------------------------------------------

function addressMatchesQuery(a, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${a.apm} ${a.adres || ""} ${a.miasto || ""} ${a.kod || ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

function routeMatchesQuery(route, query) {
  if (!query.trim()) return true;
  const addrs = ADDRESSES_BY_ROUTE[route] || [];
  if (route.toLowerCase() === query.trim().toLowerCase()) return true;
  return addrs.some((a) => addressMatchesQuery(a, query));
}

function matchingAddressesForRoute(route, query) {
  const addrs = ADDRESSES_BY_ROUTE[route] || [];
  if (!query.trim()) return addrs;
  return addrs.filter((a) => addressMatchesQuery(a, query));
}

// -------------------------------------------------------------
// Render: lista tras
// -------------------------------------------------------------

function currentRouteOrder(dateISO, query) {
  const hasQuery = query.trim().length > 0;
  let routes = ALL_ROUTES.filter((r) => routeMatchesQuery(r, query));

  if (filterMissingOnly) {
    routes = routes.filter((r) => !DECLARATIONS[declKey(r, dateISO)]);
  }

  routes.sort((a, b) => {
    if (!hasQuery) {
      const aMissing = !DECLARATIONS[declKey(a, dateISO)];
      const bMissing = !DECLARATIONS[declKey(b, dateISO)];
      if (aMissing !== bMissing) return aMissing ? -1 : 1;
    }
    return a.localeCompare(b);
  });

  return routes;
}

function renderRoutesList() {
  const dateISO = dateInput.value;
  const query = searchInput.value;
  const hasQuery = query.trim().length > 0;

  const routes = currentRouteOrder(dateISO, query);

  allRoutesEl.innerHTML = "";
  noMatchHint.classList.toggle("hidden", routes.length > 0);

  if (hasQuery) {
    routes.forEach((r) => expandedRoutes.add(r));
  }

  routes.forEach((route) => {
    allRoutesEl.appendChild(buildRouteCard(route, dateISO, hasQuery ? query : ""));
  });

  updateProgress(dateISO);
}

function refreshRouteCardInPlace(route) {
  const dateISO = dateInput.value;
  const query = searchInput.value;
  const existing = document.getElementById(`route-${route}`);

  if (existing) {
    const hasQuery = query.trim().length > 0;
    const newCard = buildRouteCard(route, dateISO, hasQuery ? query : "");
    existing.replaceWith(newCard);
  }

  updateProgress(dateISO);
  renderSummary();
  renderHistory();
  renderDoplaty();
  renderDoplatyHistory();
}

function updateProgress(dateISO) {
  const declaredCount = ALL_ROUTES.filter((r) => DECLARATIONS[declKey(r, dateISO)]).length;
  progressCount.textContent = `${declaredCount}/${ALL_ROUTES.length}`;
  const pct = Math.round((declaredCount / ALL_ROUTES.length) * 100);
  progressBarFill.style.width = `${pct}%`;
}

function buildRouteCard(route, dateISO, highlightQuery) {
  const info = effectiveCarrierInfo(route, dateISO);
  const carrierLabel = carrierDisplayName(route, info.carriers);
  const declared = DECLARATIONS[declKey(route, dateISO)];
  const pairText = courierPairText(route, dateISO);
  const isOpen = expandedRoutes.has(route);

  const card = document.createElement("div");
  card.className = `route-card ${!declared ? "missing" : ""}`;
  card.id = `route-${route}`;

  const head = document.createElement("div");
  head.className = "route-card-head";
  head.innerHTML = `
    <span class="route-badge-lg">${route}</span>
    <div class="route-head-info">
      <div class="route-head-carrier">${escapeHTML(carrierLabel)}${info.overridden ? '<span class="override-badge">zamiana kolejki</span>' : ""}</div>
      <div class="route-head-status ${declared ? "ok" : ""}">${pairText ? "✅ " + escapeHTML(pairText) : "brak zadeklarowanego kuriera"}</div>
    </div>
    <span class="chevron ${isOpen ? "open" : ""}">▶</span>
  `;
  head.addEventListener("click", () => {
    if (expandedRoutes.has(route)) expandedRoutes.delete(route);
    else expandedRoutes.add(route);
    refreshRouteCardInPlace(route);
  });

  const body = document.createElement("div");
  body.className = `route-card-body ${isOpen ? "" : "hidden"}`;
  if (isOpen) {
    body.appendChild(buildRouteCardBody(route, dateISO, info, declared, highlightQuery));
  }

  card.appendChild(head);
  card.appendChild(body);
  return card;
}

function buildRouteCardBody(route, dateISO, info, declared, highlightQuery) {
  const wrap = document.createElement("div");
  wrap.style.paddingTop = "10px";

  const courierKey = `${route}::courier`;
  const pairText = courierPairText(route, dateISO);
  const courierSummary = pairText || "brak deklaracji";
  wrap.appendChild(
    buildAccordion(courierKey, "👤 Kurier na tę trasę", courierSummary, !declared, route, () => {
      const box = document.createElement("div");
      renderCourierSection(box, route, dateISO, info);
      return box;
    })
  );

  if (info.isRotating) {
    const rotKeyName = `${route}::rotation`;
    const rotSummary = info.overridden ? "zamieniono" : "wg grafiku";
    wrap.appendChild(
      buildAccordion(rotKeyName, "🔁 Zamiana kolejności rotacji", rotSummary, false, route, () => {
        return buildRotationBody(route, dateISO, info);
      })
    );
  }

  const addrs = highlightQuery
    ? matchingAddressesForRoute(route, highlightQuery)
    : ADDRESSES_BY_ROUTE[route] || [];
  const allAddrs = ADDRESSES_BY_ROUTE[route] || [];
  if (allAddrs.length) {
    const addrKey = `${route}::addresses`;
    const label = highlightQuery ? `📍 Pasujące adresy` : `📍 Przykładowe adresy`;
    wrap.appendChild(
      buildAccordion(addrKey, label, `${addrs.length} z ${allAddrs.length}`, !!highlightQuery, route, () => {
        const chipWrap = document.createElement("div");
        addrs.slice(0, 10).forEach((a) => {
          const chip = document.createElement("span");
          chip.className = "address-chip";
          chip.textContent = `${a.adres || a.apm}, ${a.miasto}`;
          chipWrap.appendChild(chip);
        });
        if (addrs.length === 0) {
          const none = document.createElement("div");
          none.style.cssText = "font-size:12px;color:#9186A0;";
          none.textContent = "Brak pasujących adresów w tej trasie.";
          chipWrap.appendChild(none);
        }
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
    opt.textContent = abbrevCarrier(c);
    select.appendChild(opt);
  });
  select.value = info.overridden ? info.carriers[0] : "";
  select.disabled = !BACKEND_OK;

  select.addEventListener("change", async (e) => {
    const val = e.target.value;
    select.disabled = true;
    await optimisticSetRotationOverride(route, dateISO, val || null);
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

// -------------------------------------------------------------
// Sekcja kuriera: slot 1 (zawsze) + slot 2 (opcjonalny)
// -------------------------------------------------------------

function renderCourierSection(container, route, dateISO, info) {
  container.innerHTML = "";
  const key = declKey(route, dateISO);
  const declared1 = DECLARATIONS[key];
  const declared2 = DECLARATIONS2[key];

  const slot1Box = document.createElement("div");
  renderCourierSlot(slot1Box, route, dateISO, info, declared1, 1);
  container.appendChild(slot1Box);

  // Drugi kurier: widoczny tylko jesli slot1 wypelniony
  if (declared1) {
    if (declared2) {
      const label = document.createElement("div");
      label.style.cssText = "font-size:11px;font-weight:700;color:var(--purple);margin-top:10px;margin-bottom:4px;";
      label.textContent = "Drugi kurier na tej trasie:";
      container.appendChild(label);

      const slot2Box = document.createElement("div");
      slot2Box.className = "second-courier-box";
      renderCourierSlot(slot2Box, route, dateISO, info, declared2, 2);
      container.appendChild(slot2Box);
    } else if (secondSlotOpen.has(key)) {
      const label = document.createElement("div");
      label.style.cssText = "font-size:11px;font-weight:700;color:var(--purple);margin-top:10px;margin-bottom:4px;";
      label.textContent = "Drugi kurier na tej trasie:";
      container.appendChild(label);

      const slot2Box = document.createElement("div");
      slot2Box.className = "second-courier-box";
      renderCourierSlot(slot2Box, route, dateISO, info, null, 2);
      container.appendChild(slot2Box);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "link-btn";
      cancelBtn.textContent = "Anuluj dodawanie drugiego kuriera";
      cancelBtn.style.marginTop = "6px";
      cancelBtn.addEventListener("click", () => {
        secondSlotOpen.delete(key);
        refreshRouteCardInPlace(route);
      });
      container.appendChild(cancelBtn);
    } else {
      const addBtn = document.createElement("button");
      addBtn.className = "add-second-btn";
      addBtn.textContent = "+ Dodaj drugiego kuriera";
      addBtn.addEventListener("click", () => {
        secondSlotOpen.add(key);
        refreshRouteCardInPlace(route);
      });
      container.appendChild(addBtn);
    }
  }
}

function renderCourierSlot(slot, route, dateISO, info, declared, slotNum) {
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
    btn.addEventListener("click", () => {
      if (slotNum === 2) secondSlotOpen.delete(declKey(route, dateISO));
      optimisticRemoveDeclaration(route, dateISO, slotNum);
    });
    box.appendChild(btn);
    slot.appendChild(box);
    if (isSwap && slotNum === 1) {
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
  const swapKey = declKey(route, dateISO) + "::" + slotNum;
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
  quickSelect.addEventListener("change", (e) => {
    const opt = quickOptions.find((o) => o.nr === e.target.value);
    if (!opt) {
      vibrate(VIBRATE_ERROR);
      alert("Nie rozpoznano wybranego kuriera — spróbuj wybrać ponownie.");
      return;
    }
    optimisticDeclare(route, dateISO, {
      courierNr: opt.nr,
      courierName: `${opt.imie} ${opt.nazwisko}`,
      carrier: opt.carrier,
    }, slotNum);
  });
  slot.appendChild(quickSelect);

  const toggle = document.createElement("button");
  toggle.className = "link-btn";
  toggle.textContent = isSwapOpen ? "Zamknij zamianę" : "Inny kurier (zamiana z innej trasy)";
  toggle.style.marginTop = "8px";
  toggle.addEventListener("click", () => {
    if (isSwapOpen) swapSearchOpen.delete(swapKey);
    else swapSearchOpen.add(swapKey);
    refreshRouteCardInPlace(route);
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
        row.innerHTML = `<strong>${escapeHTML(m.imie)} ${escapeHTML(m.nazwisko)}</strong> (${escapeHTML(m.nr)})<br><span style="color:#9186A0;font-size:11.5px;">${escapeHTML(abbrevCarrier(m.carrier))}</span>`;
        row.addEventListener("click", () => {
          swapSearchOpen.delete(swapKey);
          optimisticDeclare(route, dateISO, {
            courierNr: m.nr,
            courierName: `${m.imie} ${m.nazwisko}`,
            carrier: m.carrier,
          }, slotNum);
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
    if (date >= today) return;
    if (!byDate[date]) byDate[date] = [];
    const secondVal = DECLARATIONS2[key];
    byDate[date].push({ route, ...val, second: secondVal || null });
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
        const names = e.courierName + (e.second ? ` + ${e.second.courierName}` : "");
        row.innerHTML = `<span><strong style="color:var(--purple)">Trasa ${escapeHTML(e.route)}</strong> — ${escapeHTML(names)}</span>`;
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
// Render: podsumowanie zadeklarowanych kurierow + eksport WhatsApp
// -------------------------------------------------------------

function buildWhatsAppText(dateISO) {
  const entries = Object.entries(DECLARATIONS)
    .filter(([k]) => k.endsWith("__" + dateISO))
    .map(([k, v]) => ({ route: k.split("__")[0], ...v, second: DECLARATIONS2[k] || null }))
    .sort((a, b) => a.route.localeCompare(b.route));

  const lines = [`*Trasy Weekendowe — sobota ${fmtDatePL(dateISO)}*`, ""];
  entries.forEach((e) => {
    const names = e.courierName + (e.second ? ` + ${e.second.courierName}` : "");
    const nrs = e.courierNr + (e.second ? ` / ${e.second.courierNr}` : "");
    lines.push(`Trasa ${e.route} — ${names} (${nrs})`);
  });
  return lines.join("\n");
}

function renderSummary() {
  const dateISO = dateInput.value;
  const entries = Object.entries(DECLARATIONS)
    .filter(([k]) => k.endsWith("__" + dateISO))
    .map(([k, v]) => ({ route: k.split("__")[0], ...v, second: DECLARATIONS2[k] || null }));

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
      const names = d.courierName + (d.second ? ` + ${d.second.courierName}` : "");
      const nrs = d.courierNr + (d.second ? ` / ${d.second.courierNr}` : "");
      const row = document.createElement("div");
      row.className = "summary-row";
      row.innerHTML = `
        <span><span class="summary-route">Trasa ${escapeHTML(d.route)}</span> — ${escapeHTML(names)} (${escapeHTML(nrs)})</span>
      `;
      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.addEventListener("click", () => optimisticRemoveDeclaration(d.route, dateISO, 1));
      btn.textContent = "✕";
      row.appendChild(btn);
      declaredListEl.appendChild(row);
    });

  let waRow = document.getElementById("wa-export-row");
  if (!waRow) {
    waRow = document.createElement("div");
    waRow.id = "wa-export-row";
    waRow.className = "wa-export-row";
    declaredSummary.appendChild(waRow);
  }
  waRow.innerHTML = "";

  const waBtn = document.createElement("button");
  waBtn.className = "wa-btn";
  waBtn.innerHTML = "📤 Wyślij do WhatsApp";
  waBtn.addEventListener("click", () => {
    const text = buildWhatsAppText(dateISO);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  });
  waRow.appendChild(waBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "wa-btn secondary";
  copyBtn.innerHTML = "📋 Kopiuj tekst";
  copyBtn.addEventListener("click", async () => {
    const text = buildWhatsAppText(dateISO);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.innerHTML = "✅ Skopiowano";
      setTimeout(() => (copyBtn.innerHTML = "📋 Kopiuj tekst"), 1500);
    } catch {
      alert("Nie udało się skopiować — zaznacz i skopiuj ręcznie:\n\n" + text);
    }
  });
  waRow.appendChild(copyBtn);
}

// -------------------------------------------------------------
// DOPLATY: upload prowizji, stawki dniowki, obliczenia, historia
// -------------------------------------------------------------

function parseCommissionWorkbook(workbook) {
  const sheetName = workbook.SheetNames.includes("data") ? "data" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length === 0) return [];

  const header = raw[0].map((h) => String(h).trim().toLowerCase());
  const idxNr = header.findIndex((h) => h.includes("numer"));
  const idxImie = header.findIndex((h) => h === "imię" || h.includes("imie"));
  const idxNazwisko = header.findIndex((h) => h.includes("nazwisko"));
  const idxFirma = header.findIndex((h) => h.includes("firma"));
  const idxPure = header.findIndex((h) => h.includes("pure"));

  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    const nr = idxNr >= 0 ? String(r[idxNr] || "").trim() : "";
    if (!nr) continue; // pomijamy wiersze bez numeru SLU (np. zbiorcze InPost NFK)
    rows.push({
      nr,
      imie: idxImie >= 0 ? String(r[idxImie] || "").trim() : "",
      nazwisko: idxNazwisko >= 0 ? String(r[idxNazwisko] || "").trim() : "",
      carrier: idxFirma >= 0 ? String(r[idxFirma] || "").trim() : "",
      pureSum: idxPure >= 0 ? Number(r[idxPure]) || 0 : 0,
    });
  }
  return rows;
}

function handleCommissionFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const dateISO = dateInput.value;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const rows = parseCommissionWorkbook(workbook);
      if (rows.length === 0) {
        alert("Nie znaleziono żadnych wierszy z numerem kuriera w pliku. Sprawdź czy to właściwy plik.");
        return;
      }
      showToast("💾 Wgrywanie…", "info", 4000);
      const resp = await apiPost("commissions", { date: dateISO, rows, fileName: file.name });
      COMMISSIONS = resp.data || COMMISSIONS;
      vibrate(VIBRATE_OK);
      showToast(`✅ Wgrano ${rows.length} wierszy`, "success");
      renderDoplaty();
      renderDoplatyHistory();
    } catch (err) {
      vibrate(VIBRATE_ERROR);
      showToast("⚠️ Błąd wgrywania", "error", 3000);
      alert("Nie udało się przetworzyć/zapisać pliku: " + err.message);
    } finally {
      commissionFileInput.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

async function saveDniowkaRates() {
  const rates = {};
  ratesGrid.querySelectorAll("input[data-route]").forEach((inp) => {
    const val = parseFloat(inp.value);
    if (!isNaN(val)) rates[inp.dataset.route] = val;
  });
  ratesSaveBtn.disabled = true;
  showToast("💾 Zapisywanie stawek…", "info", 4000);
  try {
    const resp = await apiPost("dniowka-rates", { rates });
    DNIOWKA_RATES = resp.data || rates;
    vibrate(VIBRATE_OK);
    showToast("✅ Zapisano stawki", "success");
    renderDoplaty();
    renderDoplatyHistory();
  } catch (err) {
    vibrate(VIBRATE_ERROR);
    showToast("⚠️ Nie zapisano stawek", "error", 3000);
    alert("Nie udało się zapisać stawek: " + err.message);
  }
  ratesSaveBtn.disabled = false;
}

function renderRatesGrid() {
  ratesGrid.innerHTML = "";
  ALL_ROUTES.forEach((route) => {
    const field = document.createElement("div");
    field.className = "rate-field";
    field.innerHTML = `<span class="route-badge-sm">${route}</span>`;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.dataset.route = route;
    input.value = DNIOWKA_RATES[route] != null ? DNIOWKA_RATES[route] : "";
    input.placeholder = "—";
    field.appendChild(input);
    ratesGrid.appendChild(field);
  });
}

/**
 * Oblicza doplaty dla wybranej daty na podstawie aktualnych DECLARATIONS/
 * DECLARATIONS2, prowizji z COMMISSIONS[dateISO] i stawek DNIOWKA_RATES.
 */
function computeDoplatyForDate(dateISO) {
  const commissionEntry = COMMISSIONS[dateISO];
  const pureByNr = {};
  if (commissionEntry) {
    commissionEntry.rows.forEach((r) => {
      pureByNr[r.nr] = r.pureSum;
    });
  }

  const results = [];
  ALL_ROUTES.forEach((route) => {
    const key = declKey(route, dateISO);
    const p1 = DECLARATIONS[key];
    if (!p1) return; // tylko trasy z zadeklarowanym kurierem
    const p2 = DECLARATIONS2[key];

    const dniowka = DNIOWKA_RATES[route];
    const pure1 = pureByNr[p1.courierNr];
    const pure2 = p2 ? pureByNr[p2.courierNr] : 0;

    let status, doplata = null, totalPure = null;
    if (!commissionEntry) {
      status = "no-file";
    } else if (pure1 === undefined || (p2 && pure2 === undefined)) {
      status = "missing-courier";
    } else if (dniowka == null) {
      status = "no-rate";
    } else {
      totalPure = pure1 + (pure2 || 0);
      doplata = Math.max(0, dniowka - totalPure);
      status = "ok";
    }

    results.push({ route, p1, p2, dniowka, pure1, pure2, totalPure, doplata, status });
  });

  return results;
}

function renderDoplaty() {
  const dateISO = dateInput.value;
  doplatyDateLabel.textContent = fmtDatePL(dateISO);

  const commissionEntry = COMMISSIONS[dateISO];
  if (commissionEntry) {
    commissionStatus.className = "commission-status ok";
    commissionStatus.textContent = `✅ Wgrano ${commissionEntry.rows.length} wierszy (${commissionEntry.fileName || "plik"}) — ${new Date(commissionEntry.uploadedAt).toLocaleString("pl-PL")}`;
  } else {
    commissionStatus.className = "commission-status";
    commissionStatus.textContent = "Brak wgranego pliku prowizji dla tej soboty.";
  }

  const results = computeDoplatyForDate(dateISO);
  doplatyTable.innerHTML = "";
  doplatyEmpty.classList.toggle("hidden", results.length > 0);

  results.forEach((r) => {
    doplatyTable.appendChild(buildDoplataCard(r));
  });
}

function buildDoplataCard(r) {
  const card = document.createElement("div");
  card.className = "doplata-card";

  const names = r.p1.courierName + (r.p2 ? ` + ${r.p2.courierName}` : "");

  let amountHTML, breakdownHTML;
  if (r.status === "no-file") {
    amountHTML = `<span class="doplata-amount missing">brak pliku</span>`;
    breakdownHTML = "Wgraj plik prowizji dla tej soboty, aby policzyć dopłatę.";
  } else if (r.status === "missing-courier") {
    amountHTML = `<span class="doplata-amount missing">brak danych</span>`;
    breakdownHTML = "Kuriera nie znaleziono w pliku prowizji — sprawdź numer SLU.";
  } else if (r.status === "no-rate") {
    amountHTML = `<span class="doplata-amount missing">brak stawki</span>`;
    breakdownHTML = "Ustaw stawkę dniówki dla tej trasy w sekcji „⚙️ Stawki dniówki”.";
  } else {
    const cls = r.doplata > 0 ? "positive" : "zero";
    amountHTML = `<span class="doplata-amount ${cls}">${r.doplata.toFixed(2)} zł</span>`;
    const pureText = r.p2 != null && r.pure2 !== undefined
      ? `PURE: ${r.pure1.toFixed(2)} + ${r.pure2.toFixed(2)} = ${r.totalPure.toFixed(2)} zł`
      : `PURE: ${r.pure1.toFixed(2)} zł`;
    breakdownHTML = `${pureText} · Dniówka: ${r.dniowka.toFixed(2)} zł`;
  }

  card.innerHTML = `
    <div class="doplata-head">
      <span class="route-badge-lg">${r.route}</span>
      <div class="doplata-info">
        <div class="doplata-couriers">${escapeHTML(names)}</div>
        <div class="doplata-breakdown">${breakdownHTML}</div>
      </div>
      ${amountHTML}
    </div>
  `;
  return card;
}

function renderDoplatyHistory() {
  const today = todayISO();
  const pastDates = Object.keys(COMMISSIONS)
    .filter((d) => d < today)
    .sort((a, b) => b.localeCompare(a));

  doplatyHistoryEl.innerHTML = "";
  doplatyHistoryEmpty.classList.toggle("hidden", pastDates.length > 0);

  pastDates.forEach((date) => {
    const key = `doplaty-hist::${date}`;
    const isOpen = sectionState.get(key) || false;
    const results = computeDoplatyForDate(date).filter((r) => r.status === "ok" || r.status === "missing-courier");

    const card = document.createElement("div");
    card.className = "history-card";

    const head = document.createElement("div");
    head.className = "history-head";
    head.innerHTML = `
      <div>
        <div class="history-date">Sobota ${fmtDatePL(date)}</div>
        <div class="history-count">${results.length} ${results.length === 1 ? "trasa" : "tras"} rozliczonych</div>
      </div>
      <span class="chevron ${isOpen ? "open" : ""}">▶</span>
    `;
    head.addEventListener("click", () => {
      sectionState.set(key, !isOpen);
      renderDoplatyHistory();
    });

    const body = document.createElement("div");
    body.className = `history-body ${isOpen ? "" : "hidden"}`;
    if (isOpen) {
      results.forEach((r) => {
        const row = document.createElement("div");
        row.className = "history-row";
        const names = r.p1.courierName + (r.p2 ? ` + ${r.p2.courierName}` : "");
        const doplataText = r.status === "ok" ? `${r.doplata.toFixed(2)} zł` : "brak danych";
        row.innerHTML = `<span><strong style="color:var(--purple)">Trasa ${escapeHTML(r.route)}</strong> — ${escapeHTML(names)}</span><span>${doplataText}</span>`;
        body.appendChild(row);
      });
      if (results.length === 0) {
        const none = document.createElement("div");
        none.style.cssText = "font-size:12px;color:#9186A0;padding:8px 0;";
        none.textContent = "Brak danych do rozliczenia dla tej soboty.";
        body.appendChild(none);
      }
    }

    card.appendChild(head);
    card.appendChild(body);
    doplatyHistoryEl.appendChild(card);
  });
}

// -------------------------------------------------------------
// Wyszukiwanie glosowe
// -------------------------------------------------------------

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
    renderRoutesList();

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
      // recognition already running
    }
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
