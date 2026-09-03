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
wrangler.toml           – konfiguracja Cloudflare (binding KV, pomocnicza przy CLI)
icons/                   – ikony aplikacji
functions/api/
  declarations.js         – API: deklaracje kurierów, slot 1 i 2 (GET/POST/DELETE)
  rotation-overrides.js   – API: zamiany kolejności rotacji (GET/POST/DELETE)
  commissions.js          – API: prowizje PURE per sobota, historia (GET/POST/DELETE)
  dniowka-rates.js        – API: stawki dniówki per trasa (GET/POST)
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
różnych tras nigdy się nie nadpisują. Wymaga wdrożenia na Cloudflare
Pages z podpiętym bindingiem KV — nic nie zadziała z lokalnego
podglądu bez tego bindingu.

## Wdrożenie na Cloudflare Pages

### 1. Utwórz namespace Workers KV
Cloudflare dashboard → **Workers & Pages** → **KV** → **Create a
namespace**. Nazwij np. `weekend-app-kv`. Zapisz sobie jego ID (widać
na liście po utworzeniu) — przyda się w kroku 4 (opcjonalnie, do
`wrangler.toml`).

### 2. Utwórz projekt Pages
**Workers & Pages** → **Create application** → **Pages** → **Connect
to Git** → wybierz repo. Ustawienia builda:
- **Build command**: (puste — to statyczna strona, nic nie trzeba budować)
- **Build output directory**: `weekend-app` (jeśli cała reszta repo
  to inne projekty, jak w Twoim przypadku) albo `.` jeśli repo
  zawiera tylko ten projekt.
- Cloudflare **automatycznie wykryje** folder `functions/` w katalogu
  output i wdroży je jako Pages Functions — nic więcej nie trzeba
  konfigurować w tej kwestii.

### 3. Podepnij KV do projektu
Po pierwszym deployu: projekt Pages → **Settings** → **Functions** →
**KV namespace bindings** → **Add binding**:
- Variable name: **`WEEKEND_KV`** (dokładnie taka nazwa — kod jej szuka)
- KV namespace: wybierz `weekend-app-kv` utworzony w kroku 1

### 4. Ustaw hasło do zapisu
Tam samo (**Settings** → **Environment variables**) → **Add variable**:
- Variable name: **`WEEKEND_APP_PASSWORD`**
- Value: dowolne hasło — to samo wpisujesz potem w apce w sekcji
  „🔒 Ustawienia"

### 5. Redeploy
Po dodaniu bindingu i zmiennej środowiskowej zrób **Retry deployment**
(binding/env var działają dopiero od następnego deployu, nie
retroaktywnie na już wdrożoną wersję).

Jeśli wolisz wdrażać z linii komend zamiast przez Git: `wrangler.toml`
w tym folderze ma już sekcję `[[kv_namespaces]]` — wklej tam ID
namespace'u z kroku 1, potem `wrangler pages deploy weekend-app`.

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
