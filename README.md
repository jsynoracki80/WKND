# Trasy Weekendowe — PWA

Samodzielna aplikacja (osobna od Rejonizacji) do wyszukiwania tras
weekendowych i deklarowania kurierów na sobotę. Dane zapisują się
lokalnie w przeglądarce (localStorage) — tylko na Twoim urządzeniu.

## Struktura plików

```
index.html          – strona główna
style.css           – style
app.js              – logika (wyszukiwanie, rotacja przewoźników, deklaracje)
manifest.json        – manifest PWA (ikona, nazwa, kolor)
service-worker.js    – cache / działanie offline
icons/               – ikony aplikacji
data/
  addresses.json      – 285 adresów/APM z Trasy_WKN_CZERWIEC_2026.xlsx
  couriers.json        – kurierzy pogrupowani wg przewoźnika (Tabela_skuteczności.xlsx)
  route_carriers.json  – stały przewoźnik dla 13 tras bez rotacji
  rotation.json        – grafik rotacji dla tras N/S/P/U/G (18.07.2026–02.01.2027)
```

## Wdrożenie na Netlify (jak Rejonizacja)

1. Załóż nowe repo na GitHubie (np. `trasy-weekendowe`).
2. Wrzuć wszystkie pliki z tego folderu do repo (zachowując strukturę).
3. W Netlify: „Add new site” → „Import an existing project” → wybierz repo.
   Build command: (puste), Publish directory: `.` (root repo).
4. Po wdrożeniu strona będzie dostępna pod adresem `*.netlify.app`.

## Instalacja na Androidzie (jako PWA)

1. Otwórz stronę w Chrome na telefonie.
2. Menu (⋮) → „Dodaj do ekranu głównego”.
3. Aplikacja pojawi się jako ikona, otwiera się w trybie pełnoekranowym.

## Aktualizacja danych w przyszłości

Jeśli zmieni się grafik rotacji (nowy okres po 02.01.2027) albo lista
adresów/kurierów — podmień odpowiedni plik w `data/` na nową wersję
w tym samym formacie i wypchnij zmianę do GitHuba (Netlify wdroży
automatycznie).

## Rozwiązane niezgodności danych źródłowych

- **Trasa G, „Bielecki”**: potwierdzone, że to zmieniona nazwa tego
  samego przewoźnika (CAR-TRANS Oliwia Lubert → MAGDALENA LUBERT ITR).
  Dane scalone, ostrzeżenie usunięte.
- **Trasa F, „DOMAROS”**: dwie filie tej samej firmy (Czesław i
  Sebastian Domaros) traktowane jako jeden przewoźnik — wyświetlane
  pod wspólną nazwą „DOMAROS (Czesław + Sebastian)”, kurierzy obu
  filii dostępni razem na liście wyboru.

## Funkcje

- **Wszystkie trasy** — ekran startowy pokazuje wszystkich 18 tras
  z przewoźnikiem na wybraną sobotę i statusem deklaracji, jeszcze
  zanim zaczniesz szukać konkretnego adresu.
- **Zamiana kolejności rotacji** — dla tras N/S/P/U/G można ręcznie
  nadpisać, który przewoźnik z puli obsługuje trasę w danym
  tygodniu (np. gdy kurierzy zamienią się kolejnością). Zmiana
  dotyczy tylko wybranej soboty, grafik bazowy zostaje nienaruszony.
- **Zamiana kuriera między przewoźnikami** — poza szybkim wyborem
  kuriera przypisanego przewoźnika, przycisk „Inny kurier (zamiana
  z innej trasy)” otwiera wyszukiwarkę po wszystkich kurierach w
  bazie (dowolny przewoźnik). Wybrany w ten sposób kurier oznaczony
  jest odznaką „zamiana”.
- **Wyszukiwarka adresu** — nadal dostępna niżej, do szybkiego
  ustalenia, do której trasy należy dany adres/APM; link „Otwórz
  trasę ↑” przewija do odpowiedniej karty na górze.

## Ewentualny kolejny krok: apka w Google Play (TWA)

Gdy strona będzie stabilna na Netlify, można ją opakować w Trusted
Web Activity (Bubblewrap CLI + Android Studio) i opublikować jako
prawdziwą apkę w Google Play — bez przepisywania kodu. To osobny
krok do zrobienia lokalnie, gdy będziesz gotowy.
