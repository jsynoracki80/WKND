# Trasy Weekendowe — PWA

Samodzielna aplikacja (osobna od Rejonizacji) do wyszukiwania tras
weekendowych i deklarowania kurierów na sobotę. Dane zapisują się
lokalnie w przeglądarce (localStorage) — tylko na Twoim urządzeniu.

## Struktura plików

```
index.html          – strona główna
style.css           – style
app.js               – logika (wyszukiwanie, rotacja, deklaracje, historia)
manifest.json         – manifest PWA (ikona, nazwa, kolor)
service-worker.js     – cache / działanie offline
netlify.toml          – konfiguracja Netlify (katalog funkcji)
package.json          – zależność @netlify/blobs dla funkcji
icons/                 – ikony aplikacji
netlify/functions/
  declarations.js       – API: deklaracje kurierów (GET/POST/DELETE)
  rotation-overrides.js – API: zamiany kolejności rotacji (GET/POST/DELETE)
data/
  addresses.json      – 285 adresów/APM z Trasy_WKN_CZERWIEC_2026.xlsx
  couriers.json         – kurierzy pogrupowani wg przewoźnika (Tabela_skuteczności.xlsx)
  route_carriers.json   – stały przewoźnik dla tras bez rotacji
  rotation.json          – bazowy grafik rotacji N/S/P/U/G (18.07.2026–02.01.2027)
  rotation_pools.json    – pula przewoźników do ręcznej zamiany rotacji
```

## Dane: teraz trwałe i wspólne (Netlify Blobs)

Deklaracje kurierów i zamiany rotacji **nie są już zapisywane w
przeglądarce (localStorage)** — trafiają do Netlify Blobs przez dwie
funkcje serwerowe. To oznacza:

- dane przetrwają zamknięcie aplikacji, odświeżenie, redeploy strony,
  wyczyszczenie danych przeglądarki,
- są dostępne z każdego urządzenia (telefon, komputer) pod tym samym
  adresem,
- **wymaga wdrożenia na Netlify z aktywnymi Functions** — nie zadziała
  z lokalnego `python -m http.server` ani z otwarcia pliku bezpośrednio.

## Wdrożenie na Netlify

1. Wrzuć całą zawartość folderu `weekend-app/` do repo (zachowując
   strukturę, łącznie z `netlify/`, `netlify.toml`, `package.json`).
2. W Netlify: Site configuration → Build & deploy → Build settings:
   - **Base directory**: `weekend-app` (bez spacji!)
   - **Publish directory**: `weekend-app`
   - **Functions directory**: `weekend-app/netlify/functions`
     (Netlify powinien to też wyczytać automatycznie z `netlify.toml`)
3. **Ustaw hasło do zapisu** — Site configuration → Environment
   variables → Add a variable:
   - Key: `WEEKEND_APP_PASSWORD`
   - Value: dowolne hasło, które będziesz wpisywać w apce
     (sekcja „🔒 Ustawienia”), żeby móc zapisywać/usuwać deklaracje
4. Trigger deploy → Clear cache and deploy site.
5. Po wdrożeniu Netlify automatycznie instaluje `@netlify/blobs`
   (z `package.json`) i buduje funkcje — nie trzeba nic dodatkowo
   konfigurować, magazyn Blobs jest przypisany do strony automatycznie.

Jeśli backend jest niedostępny (np. jeszcze nie wdrożony), aplikacja
nadal działa do przeglądania tras i wyszukiwania adresów — tylko
zapisywanie/usuwanie deklaracji i zamian rotacji jest wtedy
zablokowane, z czerwonym ostrzeżeniem w interfejsie.

## Nowości w tej wersji

- **Kolejność w karcie trasy**: po rozwinięciu trasy najpierw widać
  zwijane podmenu „👤 Kurier” (otwarte domyślnie, dopóki nie ma
  deklaracji), potem „🔁 Zamiana kolejności rotacji” (tylko trasy
  N/S/P/U/G), na końcu „📍 Przykładowe adresy”.
- **Historia** — osobna sekcja niżej na stronie, pokazuje wszystkie
  minione soboty z zapisanymi deklaracjami. Rozwijalna karta na
  sobotę pokazuje listę tras+kurierów, z przyciskiem „Otwórz tę
  sobotę w edytorze”, żeby np. skorygować wpis z przeszłości.
- **Hasło do zapisu** — sekcja „🔒 Ustawienia” na górze strony,
  zwijana. Wpisane raz zapamiętuje się na urządzeniu (localStorage) —
  potrzebne tylko przy zapisie/usuwaniu, nie przy przeglądaniu.
- **Wyszukiwanie głosowe** — przycisk 🎤 obok pola wyszukiwania
  adresu. Działa przez wbudowane w przeglądarkę rozpoznawanie mowy
  (Web Speech API, język polski) — najlepiej wspierane w Chrome
  (w tym Chrome na Androidzie). Jeśli w wypowiedzi nie pada nazwa
  żadnego znanego miasta z bazy, aplikacja automatycznie dopisuje
  „Słupsk” do zapytania — więc powiedzenie samej ulicy i numeru
  (np. „Łotewska 2”) trafi we właściwy adres w Słupsku, nawet gdy
  taka sama nazwa ulicy istnieje też w innej miejscowości.


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
