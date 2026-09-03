# Trasy Weekendowe — PWA (Cloudflare Pages)

Samodzielna aplikacja (osobna od Rejonizacji) do wyszukiwania tras
weekendowych, deklarowania kurierów na sobotę i liczenia dopłat do
dniówki. Hostowana na **Cloudflare Pages**, dane w **Cloudflare
Workers KV** — ten sam mechanizm co Rejonizacja.

## Struktura plików

```
index.html          – strona główna
style.css            – style
app.js                – logika (wyszukiwanie, rotacja, deklaracje, dopłaty, historia)
manifest.json          – manifest PWA (ikona, nazwa, kolor)
service-worker.js      – cache / działanie offline
worker.js               – Cloudflare Worker: routing /api/* + statyczne pliki
wrangler.toml            – konfiguracja Workera (assets, KV binding)
.assetsignore             – wyklucza worker.js/wrangler.toml z publicznego serwowania
icons/                   – ikony aplikacji
data/
  addresses.json         – 285 adresów/APM z Trasy_WKN_CZERWIEC_2026.xlsx
  couriers.json            – kurierzy pogrupowani wg przewoźnika
  route_carriers.json      – stały przewoźnik dla tras bez rotacji
  rotation.json             – bazowy grafik rotacji N/S/P/U/G (18.07.2026–02.01.2027)
  rotation_pools.json       – pula przewoźników do ręcznej zamiany rotacji
```

## Dane: trwałe i wspólne (Cloudflare Workers KV)

Deklaracje, zamiany rotacji, prowizje i stawki dniówki trafiają do
jednego namespace'u Workers KV, z osobnym kluczem per wpis (prefiksy
`decl:`, `rot:`, `comm:`, `rates:`) — dzięki temu równoczesne zapisy
różnych tras nigdy się nie nadpisują.

## Wdrożenie — jeden Worker (statyczne pliki + API)

Cloudflare od 2026 r. zaleca dla nowych projektów **Workers ze
statycznymi zasobami** zamiast osobnego produktu Pages (Pages nadal
działa dla istniejących projektów, ale nie jest już domyślną ścieżką
dla nowych). Ta apka używa jednego Workera (`worker.js`), który
serwuje zarówno pliki statyczne (przez binding `ASSETS`), jak i
endpointy `/api/*`.

### 1. Utwórz namespace Workers KV
**Workers & Pages** → **Storage & databases** → **Workers KV** →
**Create Instance**. Nazwij np. `WKND`. Skopiuj jego **ID** — będzie
potrzebne w kroku 3.

### 2. Uzupełnij `wrangler.toml`
W tym pliku w repo, w sekcji `[[kv_namespaces]]`, wklej prawdziwe ID
namespace'u z kroku 1 w miejsce `TU_WKLEJ_ID_NAMESPACE_KV`.

### 3. Podłącz repo jako Worker
**Workers & Pages** → **Create application** → wybierz opcję importu
z repozytorium Git (np. „Import a repository” / „Connect to Git” —
dokładna nazwa przycisku może się różnić, bo Cloudflare cały czas
zmienia ten ekran). Wskaż swoje repo. Jeśli panel pyta o katalog
źródłowy (root directory) — ustaw `weekend-app`. Cloudflare powinien
sam wykryć `wrangler.toml` i użyć komendy `wrangler deploy`.

### 4. Ustaw hasło do zapisu
Po utworzeniu Workera: **Settings** → **Variables and Secrets** →
**Add** → Type: **Secret** (albo zwykła zmienna, jeśli nie ma opcji
Secret) → Name: **`WEEKEND_APP_PASSWORD`**, Value: dowolne hasło.

### 5. Sprawdź binding KV
**Settings** → **Bindings** — powinien tam już być `WEEKEND_KV`
wzięty z `wrangler.toml` (krok 2). Jeśli go nie ma, dodaj ręcznie:
**Add binding** → **KV namespace** → Variable name: `WEEKEND_KV` →
wybierz namespace z kroku 1.

### 6. Redeploy
Jeśli dodawałeś/zmieniałeś coś w kroku 4-5 już po pierwszym
deployu — zrób ponowny deploy (Deployments → Retry deployment),
zmienne/bindingi działają dopiero od następnego builda.

Adres Workera to zwykle `nazwa-projektu.<twoj-subdomain>.workers.dev`
(widoczny na górze strony projektu).

Jeśli wdrażasz z linii komend zamiast przez Git:
```
npx wrangler deploy
```
uruchomione w folderze `weekend-app` (wymaga zalogowania: `npx wrangler login`).

## Zakładka „💰 Dopłaty"

Automatyczne wyliczanie dopłaty do dniówki na podstawie kurierów
zadeklarowanych na trasy.

**Zasada**: `Dopłata = max(0, Dniówka trasy − suma prowizji PURE kurierów na tej trasie)`.
Jeśli prowizja PURE ≥ dniówka, dopłata wynosi 0.

**Jak korzystać co tydzień:**
1. Wgraj plik `.xlsx` z prowizjami (przycisk „📤 Wgraj plik prowizji")
   — kolumny: Numer, Imię, Nazwisko, Firma, Suma prowizji z PURE
   SYSTEMU. Plik dotyczy **wybranej w apce soboty** — wgrywaj go po
   ustawieniu właściwej daty na górze.
2. Stawki dniówki per trasa ustawiasz raz w sekcji „⚙️ Stawki
   dniówki" (edytowalne, zapisywane na serwerze, chronione hasłem).
3. Tabela dopłat liczy się automatycznie dla wszystkich tras z
   zadeklarowanym kurierem. Kurier nieznaleziony w pliku prowizji
   (np. literówka w numerze SLU) pokazuje „brak danych" zamiast
   błędnej kwoty.
4. **Historia dopłat** — każdy tydzień zostaje zapisany na stałe (jak
   Historia deklaracji), nic się nie nadpisuje. Uwaga: przy
   przeliczaniu historycznych sobót używane są **aktualne** stawki
   dniówki, nie te sprzed zmiany (stawki nie mają własnej historii).

**Drugi kurier na trasie** — pod zadeklarowanym kurierem pojawia się
„+ Dodaj drugiego kuriera" (widoczne tylko dopóki drugi slot jest
pusty). Gdy trasę obsługuje dwóch kurierów, ich prowizje sumują się
przy liczeniu dopłaty (bez podziału — jedna łączna kwota, rozdzielana
ręcznie), a obaj widoczni są wszędzie: w nagłówku trasy, podsumowaniu,
historii, eksporcie WhatsApp i w tabeli dopłat.

## Baza kurierów — aktualizacja 02.09.2026

Zbudowana z trzech plików źródłowych z tego dnia:
- `kurierzy_aktywne_umowy_20260902_190513.csv` (144 aktywnych kurierów)
- `kandydaci_na_kurierów_20260902_190934.csv` (7 kandydatów)
- `aktywni_przewoźnicy_ow_20260902_190647.csv` (26 przewoźników, do
  weryfikacji nazw)

**Zasady kwalifikacji do wyboru na trasę weekendową:**
- Typy **MIX i D2D** są wliczane.
- Typ **RVM** (opakowania kaucyjne) i **BRANCH** (techniczne konto
  InPost, SLU1000) są całkowicie wykluczone.
- **Kandydaci z nadanym numerem SLU** są wliczani tak samo jak
  aktywni kurierzy (dodano: Marcel Gondek SLU1316, Robert Kondraciuk
  SLU1280, Sebastian Drzycimski SLU1319, Mateusz Szarpak SLU1318).
  Trzej kandydaci bez numeru SLU (Krystian Ryzop, Patryk Korewo,
  Grzegorz Jankowski) nie mogli zostać dodani — dodaj ich ręcznie, gdy
  numer zostanie nadany.

**Scalenia przewoźników (traktowani jako jedna firma):**
- „CAR-TRANS Oliwia Lubert" + „Magdalena Lubert ITR" → **Lubert**
- „Mirosław Wojtas" (nowa nazwa) + „Firma Usługowa Klaudia
  Wiśniewska" (stara nazwa, w trakcie wygaszania) → **Wojtas**
- „Domaros Czesław" + „Domaros Sebastian" (dwie filie) → **Domaros**

Finalnie: **138 kurierów w 27 przewoźnikach** dostępnych do wyboru.

## Skróty nazw przewoźników

Ustalone wspólnie, używane wszędzie w interfejsie zamiast pełnych
nazw prawnych (pełna lista w `app.js`, stała `CARRIER_ABBREV`):
Szeląg, Szostak, Daniel G., Wódz D., Dagosz, Wojtas, Kozioł, Krefta,
Prokopowicz, Giec, Hasiec, Kulpa, Kondraciuk, Lubert, Konkel,
Niezapominajka, Opos, Sawicki, Puławska, Kuczyński, Wódz P.,
Jankowski, Gumiś, Orwat, Domaros, Poltrans.

## Funkcje

- **Wszystkie trasy jako ekran startowy** — filtrowane bezpośrednio
  wyszukiwarką, sortowane: brakujące najpierw.
- **Sticky pasek na górze** — data, chipy szybkiego wyboru, wyszukiwarka
  i mikrofon.
- **Licznik postępu** (X/18) z paskiem wizualnym + filtr „tylko
  brakujące".
- **Kolejność w karcie trasy**: „👤 Kurier" → „🔁 Zamiana kolejności
  rotacji" (N/S/P/U/G) → „📍 Adresy".
- **Zamiana kuriera między przewoźnikami** — wyszukiwarka po
  wszystkich kurierach w bazie.
- **Historia** minionych sobót, z możliwością edycji wstecz.
- **Wyszukiwanie głosowe** (🎤) — domyślnie dopisuje „Słupsk" gdy nie
  podano miasta.
- **Eksport do WhatsApp** — gotowy tekst do wysłania lub skopiowania.
- **Optymistyczne zapisy** — ✅ pojawia się natychmiast, z wycofaniem
  przy niepowodzeniu. Odświeżana jest tylko karta danej trasy.
- **Wibracje + wskaźnik „Zapisywanie…"** przy każdej akcji.
- **Hasło do zapisu** — zwijana sekcja „🔒 Ustawienia".
- **Dopłaty do dniówki** — patrz sekcja wyżej.

## Znane ograniczenia / do zrobienia w przyszłości

- 3 kandydatów bez numeru SLU — dodać ręcznie po nadaniu numeru.
- Przewoźnik „POLTRANS Dominika Underlich" (1 kurier D2D) nie jest
  jeszcze przypisany do żadnej trasy weekendowej.
- Grafik rotacji N/S/P/U/G pokrywa tylko okres 18.07.2026–02.01.2027.
- Stawki dniówki nie mają własnej historii (patrz sekcja Dopłaty).
