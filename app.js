// =============================================================
// Trasy Weekendowe — logika aplikacji
// © 2026 Jacek Synoracki — Oddział Słupsk
// =============================================================

const ALL_ROUTES = ["A","B","C","D","F","G","J","K","M","N","P","Q","S","T","U","V","W","X"];
const ROTATING_ROUTES = ["N", "S", "P", "U", "G"];
const MERGED_LABELS = {
  F: "DOMAROS (Czesław + Sebastian)",
};

const DECL_STORAGE_KEY = "trasy_weekendowe_deklaracje_v1";
const ROT_OVERRIDE_KEY = "trasy_weekendowe_rotacja_override_v1";

let COURIERS_BY_CARRIER = {};
let ADDRESSES = [];
let ROUTE_CARRIERS = {};
let ROTATION = {};
let ROTATION_POOLS = {};
let ADDRESSES_BY_ROUTE = {};
let FLAT_COURIERS = [];

const expandedRoutes = new Set();
const swapSearchOpen = new Set(); // route keys where "inny kurier" search box is open

const dateInput = document.getElementById("date-input");
const dateWarning = document.getElementById("date-warning");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const allRoutesEl = document.getElementById("all-routes");
const declaredSummary = document.getElementById("declared-summary");
const declaredListEl = document.getElementById("declared-list");
const summaryDateEl = document.getElementById("summary-date");

// -------------------------------------------------------------
// Inicjalizacja
// -------------------------------------------------------------

async function init() {
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

  dateInput.value = nextSaturdayISO();
  dateInput.addEventListener("change", () => {
    validateDate();
    renderAll();
  });

  searchInput.addEventListener("input", () => renderSearchResults());

  validateDate();
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

function renderAll() {
  renderRoutesList();
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

function loadRotationOverrides() {
  try {
    return JSON.parse(localStorage.getItem(ROT_OVERRIDE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRotationOverrides(data) {
  localStorage.setItem(ROT_OVERRIDE_KEY, JSON.stringify(data));
}

function rotKey(route, dateISO) {
  return `${route}__${dateISO}`;
}

function getRotationOverride(route, dateISO) {
  const data = loadRotationOverrides();
  return data[rotKey(route, dateISO)] || null;
}

function setRotationOverride(route, dateISO, carrier) {
  const data = loadRotationOverrides();
  data[rotKey(route, dateISO)] = carrier;
  saveRotationOverrides(data);
}

function clearRotationOverride(route, dateISO) {
  const data = loadRotationOverrides();
  delete data[rotKey(route, dateISO)];
  saveRotationOverrides(data);
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
// Deklaracje kuriera (localStorage)
// -------------------------------------------------------------

function loadDeclarations() {
  try {
    return JSON.parse(localStorage.getItem(DECL_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDeclarations(decl) {
  localStorage.setItem(DECL_STORAGE_KEY, JSON.stringify(decl));
}

function declKey(route, dateISO) {
  return `${route}__${dateISO}`;
}

function declareCourier(route, dateISO, courier) {
  const decl = loadDeclarations();
  decl[declKey(route, dateISO)] = courier;
  saveDeclarations(decl);
  renderAll();
}

function removeDeclaration(route, dateISO) {
  const decl = loadDeclarations();
  delete decl[declKey(route, dateISO)];
  saveDeclarations(decl);
  renderAll();
}

// -------------------------------------------------------------
// Render: lista wszystkich tras
// -------------------------------------------------------------

function renderRoutesList() {
  const dateISO = dateInput.value;
  const decl = loadDeclarations();
  allRoutesEl.innerHTML = "";

  ALL_ROUTES.forEach((route) => {
    allRoutesEl.appendChild(buildRouteCard(route, dateISO, decl));
  });
}

function buildRouteCard(route, dateISO, decl) {
  const info = effectiveCarrierInfo(route, dateISO);
  const carrierLabel = carrierDisplayName(route, info.carriers);
  const declared = decl[declKey(route, dateISO)];
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

  const addrs = ADDRESSES_BY_ROUTE[route] || [];
  if (addrs.length) {
    const addrSection = document.createElement("div");
    addrSection.className = "subsection";
    addrSection.innerHTML = `<div class="subsection-label">Przykladowe adresy (${addrs.length})</div>`;
    const chipWrap = document.createElement("div");
    addrs.slice(0, 6).forEach((a) => {
      const chip = document.createElement("span");
      chip.className = "address-chip";
      chip.textContent = `${a.adres || a.apm}, ${a.miasto}`;
      chipWrap.appendChild(chip);
    });
    addrSection.appendChild(chipWrap);
    wrap.appendChild(addrSection);
  }

  if (info.isRotating) {
    const pool = ROTATION_POOLS[route] || [];
    const rotSection = document.createElement("div");
    rotSection.className = "subsection";
    rotSection.innerHTML = `<div class="subsection-label">Przewoznik na te sobote (rotacja)</div>`;

    const select = document.createElement("select");
    const autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = "Wg grafiku rotacji (domyslnie)";
    select.appendChild(autoOpt);
    pool.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });
    select.value = info.overridden ? info.carriers[0] : "";

    select.addEventListener("change", (e) => {
      if (e.target.value === "") {
        clearRotationOverride(route, dateISO);
      } else {
        setRotationOverride(route, dateISO, e.target.value);
      }
      renderAll();
    });

    rotSection.appendChild(select);

    if (info.overridden) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:11.5px;color:#9A5B12;margin-top:5px;";
      note.textContent = "Zamieniono kolejnosc rotacji recznie dla tej soboty.";
      rotSection.appendChild(note);
    }
    wrap.appendChild(rotSection);
  }

  const courierSection = document.createElement("div");
  courierSection.className = "subsection";
  courierSection.innerHTML = `<div class="subsection-label">Kurier na te trase</div>`;
  const slot = document.createElement("div");
  courierSection.appendChild(slot);
  wrap.appendChild(courierSection);

  renderCourierSlot(slot, route, dateISO, info, declared);

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
    btn.addEventListener("click", () => removeDeclaration(route, dateISO));
    box.appendChild(btn);
    slot.appendChild(box);
    if (isSwap) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:11px;color:#6A2E9E;margin-top:5px;";
      note.textContent = `Normalnie ta trasa jest obslugiwana przez: ${carrierDisplayName(route, info.carriers)}.`;
      slot.appendChild(note);
    }
    return;
  }

  const quickOptions = couriersForCarriers(info.carriers);
  const swapKey = declKey(route, dateISO);
  const isSwapOpen = swapSearchOpen.has(swapKey);

  const quickSelect = document.createElement("select");
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.disabled = true;
  emptyOpt.selected = true;
  emptyOpt.textContent = quickOptions.length ? "Wybierz kuriera przewoznika..." : "Brak kurierow tego przewoznika w bazie";
  quickSelect.appendChild(emptyOpt);
  quickOptions.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.nr;
    opt.textContent = `${o.imie} ${o.nazwisko} (${o.nr})`;
    quickSelect.appendChild(opt);
  });
  quickSelect.addEventListener("change", (e) => {
    const opt = quickOptions.find((o) => o.nr === e.target.value);
    if (opt) {
      declareCourier(route, dateISO, {
        courierNr: opt.nr,
        courierName: `${opt.imie} ${opt.nazwisko}`,
        carrier: opt.carrier,
      });
    }
  });
  slot.appendChild(quickSelect);

  const toggle = document.createElement("button");
  toggle.className = "link-btn";
  toggle.textContent = isSwapOpen ? "Zamknij zamiane" : "Inny kurier (zamiana z innej trasy)";
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
    searchBox.placeholder = "Szukaj po nazwisku lub numerze kuriera...";
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
        none.textContent = "Brak wynikow.";
        resultsBox.appendChild(none);
        return;
      }

      matches.forEach((m) => {
        const row = document.createElement("div");
        row.style.cssText =
          "padding:8px 9px; border-radius:8px; font-size:13px; cursor:pointer; border:1px solid #F0ECF6; margin-bottom:5px;";
        row.innerHTML = `<strong>${escapeHTML(m.imie)} ${escapeHTML(m.nazwisko)}</strong> (${escapeHTML(m.nr)})<br><span style="color:#9186A0;font-size:11.5px;">${escapeHTML(m.carrier)}</span>`;
        row.addEventListener("click", () => {
          declareCourier(route, dateISO, {
            courierNr: m.nr,
            courierName: `${m.imie} ${m.nazwisko}`,
            carrier: m.carrier,
          });
          swapSearchOpen.delete(swapKey);
        });
        resultsBox.appendChild(row);
      });
    }

    searchBox.addEventListener("input", renderSwapResults);
    slot.appendChild(swapWrap);
  }
}

// -------------------------------------------------------------
// Render: wyszukiwanie adresow (skrot do trasy)
// -------------------------------------------------------------

function renderSearchResults() {
  const q = searchInput.value.trim().toLowerCase();
  resultsEl.innerHTML = "";
  if (!q) return;

  const matches = ADDRESSES.filter((a) => {
    return (
      a.apm.toLowerCase().includes(q) ||
      (a.adres || "").toLowerCase().includes(q) ||
      (a.miasto || "").toLowerCase().includes(q) ||
      (a.kod || "").toLowerCase().includes(q)
    );
  }).slice(0, 30);

  if (matches.length === 0) {
    const div = document.createElement("div");
    div.className = "empty-hint";
    div.textContent = `Brak wynikow dla „${searchInput.value.trim()}".`;
    resultsEl.appendChild(div);
    return;
  }

  const dateISO = dateInput.value;
  const decl = loadDeclarations();

  matches.forEach((r) => {
    const info = effectiveCarrierInfo(r.trasa, dateISO);
    const declared = decl[declKey(r.trasa, dateISO)];

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
          Przewoznik: <strong>${escapeHTML(carrierDisplayName(r.trasa, info.carriers))}</strong>
        </div>
        <div class="carrier-line">
          Kurier: ${declared ? "✅ " + escapeHTML(declared.courierName) : "brak deklaracji"}
        </div>
        <a href="#route-${r.trasa}" class="jump-link">Otworz trase ${r.trasa} ↑</a>
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
// Render: podsumowanie zadeklarowanych kurierow
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
