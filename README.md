# Trasy Weekendowe — PWA

Samodzielna aplikacja (osobna od Rejonizacji) do wyszukiwania tras
weekendowych i deklarowania kurierów na sobotę.

## Struktura plików

```
index.html          – strona główna
style.css            – style
app.js                – logika (wyszukiwanie, rotacja, deklaracje, historia)
manifest.json          – manifest PWA (ikona, nazwa, kolor)
service-worker.js      – cache / działanie offline
netlify.toml            – konfiguracja Netlify (katalog funkcji)
package.json            – zależność @netlify/blobs dla funkcji
icons/                   – ikony aplikacji
netlify/functions/
  declarations.js         – API: deklaracje kurierów (GET/POST/DELETE)
  rotation-overrides.js   – API: zamiany kolejności rotacji (GET/POST/DELETE)
data/
  addresses.json         – 285 adresów/APM z Trasy_WKN_CZERWIEC_2026.xlsx
  couriers.json            – kurierzy pogrupowani wg przewoźnika
  route_carriers.json      – stały przewoźnik dla tras bez rotacji
  rotation.json             – bazowy grafik rotacji N/S/P/U/G (18.07.2026–02.01.2027)
  rotation_pools.json       – pula przewoźników do ręcznej zamiany rotacji
```

## Dane: trwałe i wspólne (Netlify Blobs)

Deklaracje kurierów i zamiany rotacji trafiają do Netlify Blobs przez
dwie funkcje serwerowe, z niezależnym kluczem per wpis (trasa+data) —
dzięki temu równoczesne zapisy różnych tras nigdy się nie nadpisują.
Wymaga wdrożenia na Netlify z aktywnymi Functions.

## Wdrożenie na Netlify

1. Wrzuć całą zawartość folderu `weekend-app/` do repo (zachowując
   strukturę, łącznie z `netlify/`, `netlify.toml`, `package.json`).
2. Build settings: **Base directory** i **Publish directory**:
   `weekend-app` (bez spacji!). **Functions directory**:
   `weekend-app/netlify/functions` (Netlify wyczyta to też z `netlify.toml`).
3. Environment variables → `WEEKEND_APP_PASSWORD` (hasło do zapisu,
   wpisywane też w apce w sekcji „🔒 Ustawienia").
4. Trigger deploy → Clear cache and deploy site.

## Baza kurierów — aktualizacja 02.09.2026

Zbudowana z trzech plików źródłowych z tego dnia:
- `kurierzy_aktywne_umowy_20260902_190513.csv` (144 aktywnych kurierów)
- `kandydaci_na_kurierów_20260902_190934.csv` (7 kandydatów)
- `aktywni_przewoźnicy_ow_20260902_190647.csv` (26 przewoźników, do
  weryfikacji nazw)

**Zasady kwalifikacji do wyboru na trasę weekendową:**
- Typy **MIX i D2D** są wliczane (na życzenie: D2D traktowany tak
  samo jak MIX).
- Typ **RVM** (opakowania kaucyjne) i **BRANCH** (techniczne konto
  InPost, SLU1000) są całkowicie wykluczone — nie pojawiają się ani
  w szybkim wyborze, ani w wyszukiwarce zamiany.
- **Kandydaci z nadanym numerem SLU** są wliczani tak samo jak
  aktywni kurierzy (dodano: Marcel Gondek SLU1316, Robert Kondraciuk
  SLU1280, Sebastian Drzycimski SLU1319, Mateusz Szarpak SLU1318).
  Trzej kandydaci bez numeru SLU (Krystian Ryzop, Patryk Korewo,
  Grzegorz Jankowski) nie mogli zostać dodani — aplikacja
  identyfikuje kurierów po numerze SLU. Dodaj ich ręcznie, gdy numer
  zostanie nadany.

**Scalenia przewoźników (traktowani jako jedna firma, kurierzy razem
pod wspólnym skrótem):**
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
  wyszukiwarką (bez osobnej sekcji wyników), sortowane: brakujące
  najpierw.
- **Sticky pasek na górze** — data, chipy szybkiego wyboru („Ta
  sobota" / „Następna sobota" / „Za 2 tyg."), wyszukiwarka i mikrofon.
- **Licznik postępu** (X/18) z paskiem wizualnym + filtr „tylko
  brakujące".
- **Kolejność w karcie trasy**: „👤 Kurier" (pierwsze, otwarte
  domyślnie dopóki nie ma deklaracji) → „🔁 Zamiana kolejności
  rotacji" (tylko N/S/P/U/G) → „📍 Adresy".
- **Zamiana kuriera między przewoźnikami** — wyszukiwarka po
  wszystkich kurierach w bazie, nie tylko przypisanym przewoźniku.
- **Historia** minionych sobót, z możliwością edycji wstecz.
- **Wyszukiwanie głosowe** (🎤) — domyślnie dopisuje „Słupsk" gdy nie
  podano miasta.
- **Eksport do WhatsApp** — gotowy tekst (trasa, kurier, SLU) do
  wysłania lub skopiowania.
- **Optymistyczne zapisy** — ✅ pojawia się natychmiast, z
  wycofaniem i czytelnym błędem przy niepowodzeniu. Odświeżana jest
  tylko karta danej trasy, nie cała lista.
- **Wibracje + wskaźnik „Zapisywanie…"** przy każdej akcji.
- **Hasło do zapisu** — zwijana sekcja „🔒 Ustawienia".

## Znane ograniczenia / do zrobienia w przyszłości

- 3 kandydatów bez numeru SLU (patrz wyżej) — dodać ręcznie po
  nadaniu numeru.
- Przewoźnik „POLTRANS Dominika Underlich" (1 kurier D2D) nie jest
  jeszcze przypisany do żadnej trasy weekendowej — gdy będzie
  potrzebny, wystarczy dodać go do `route_carriers.json` albo do
  puli rotacji w `rotation_pools.json`.
- Grafik rotacji N/S/P/U/G pokrywa tylko okres 18.07.2026–02.01.2027
  — po tej dacie trzeba dostarczyć nowy harmonogram.
