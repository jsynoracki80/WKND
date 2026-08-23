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

## Ważna poprawka: utrata deklaracji przy równoczesnych zapisach

**Naprawiony błąd** (jeśli korzystałeś z wcześniejszej wersji): przy
szybkim, nachodzącym na siebie deklarowaniu kilku tras pod rząd (np.
trasa A, zaraz potem C, zaraz potem D) mogła gubić się część
wcześniejszych zapisów — zostawała tylko ostatnia. Przyczyna: obie
funkcje trzymały wszystkie deklaracje w jednym wspólnym „bloku"
danych (odczyt całości → zmiana → zapis całości). Dwa równoczesne
zapisy nadpisywały się nawzajem.

Naprawione: każda deklaracja (trasa+data) ma teraz **własny,
niezależny klucz** w magazynie — zapisy różnych tras nigdy się nie
nadpisują, niezależnie od tego jak szybko po sobie następują.
Potwierdzone testem symulującym dokładnie ten scenariusz.

**Uwaga przy wdrożeniu tej poprawki**: nazwa magazynu (store) się nie
zmieniła, ale sposób zapisu tak — stare dane zapisane pod starym
schematem (jeden klucz „all") nie zostaną automatycznie podchwycone
przez nową wersję. Jeśli miałeś już jakieś deklaracje zapisane, po
wdrożeniu tej poprawki będziesz musiał wpisać je ponownie (jednorazowo).

## Nowości: wydajność i niezawodność zapisu

Naprawiono prawdopodobną przyczynę „3-5 prób zanim się zapisze":

- **Optymistyczna aktualizacja** — po wybraniu kuriera ✅ pojawia się
  natychmiast (jeszcze zanim serwer potwierdzi zapis), zamiast
  czekać na odpowiedź sieci. Jeśli zapis się jednak nie uda, zmiana
  cofa się automatycznie z czytelnym komunikatem błędu.
- **Odświeżanie tylko jednej karty trasy**, nie całej listy 18 —
  wcześniej każda deklaracja przebudowywała wszystkie karty od zera,
  co na wolniejszym połączeniu mogło powodować „gubienie" dotknięć.
- **Koniec cichych niepowodzeń** — każdy błąd zapisu (złe hasło,
  brak sieci, nierozpoznany wybór) pokazuje teraz wyraźny komunikat
  i delikatną wibrację, zamiast nic nie robić.
- **Wskaźnik zapisu** — mały pasek u dołu ekranu („💾 Zapisywanie…"
  → „✅ Zapisano") przy każdej akcji.
- **Wibracje (haptyka)** — krótkie potwierdzenie przy udanym
  zapisie, inny wzorzec przy błędzie — czuć telefonem, nie trzeba
  patrzeć na ekran.
- **Opóźnione wyszukiwanie (debounce)** — lista tras filtruje się
  ~200ms po ostatnim wpisanym znaku, a nie po każdym znaku z osobna.
- **Eksport do WhatsApp** — w panelu „Zadeklarowani kurierzy" dwa
  przyciski: „📤 Wyślij do WhatsApp” (otwiera wybór czatu z gotowym
  tekstem: trasa, imię i nazwisko, nr SLU) oraz „📋 Kopiuj tekst”
  jako zapasowa opcja.

## Baza kurierów

Zaktualizowana na podstawie `kurierzy_aktywne_umowy_...xlsx` (140
aktywnych kurierów wg umów, stan na 17.08.2026):

- **Kurierzy typu RVM (opakowania kaucyjne) są całkowicie wykluczeni**
  z bazy — nie pojawiają się ani w szybkim wyborze kuriera, ani w
  wyszukiwarce zamiany „Inny kurier”. Obecnie to 10 osób.
- Zostaje **130 kurierów typu MIX** (D2D + APM) w 27 przewoźnikach.
- CAR-TRANS Oliwia Lubert i MAGDALENA LUBERT ITR są nadal traktowane
  jako jedna firma (scalone, zgodnie z wcześniejszym ustaleniem) —
  4 kurierów razem pod etykietą „Lubert”.

**Aktualizacja w przyszłości**: gdy zmieni się skład kurierów albo
któryś przejdzie na RVM/z powrotem na MIX, wystarczy wygenerować
nowy raport aktywnych umów (ten sam format kolumn: Imię, Nazwisko,
Numer EABI, Numer kuriera, Typ kuriera, telefony, NIP, Nazwa
przewoźnika) i przesłać do przetworzenia — bez ręcznego pisania
listy wykluczeń.

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

- **Skrócone nazwy przewoźników** — wszędzie w interfejsie zamiast
  pełnych nazw prawnych widać krótkie etykiety (np. „Krefta”,
  „Kozioł”, „Opos”, „Domaros”) ustalone wspólnie. Trasa F (dwie
  filie Domaros) wyświetla się jako jeden „Domaros”.
- **Wyszukiwarka scalona z listą tras** — jedno pole na górze filtruje
  bezpośrednio karty tras zamiast osobnej listy wyników. Pasująca
  trasa rozwija się automatycznie i pokazuje tylko pasujące adresy.
- **Sticky pasek na górze** — data, chipy szybkiego wyboru („Ta
  sobota” / „Następna sobota” / „Za 2 tyg.”), wyszukiwarka i
  mikrofon zostają widoczne na ekranie nawet przy przewijaniu listy
  tras w dół.
- **Licznik postępu** — pasek „X/18 tras obsadzonych” z wizualnym
  paskiem postępu, aktualizuje się na bieżąco.
- **Filtr „tylko brakujące”** — przełącznik ukrywający trasy, które
  mają już zadeklarowanego kuriera na wybraną sobotę.
- **Sortowanie: brakujące najpierw** — trasy bez kuriera są zawsze na
  górze listy (poza aktywnym wyszukiwaniem, gdzie liczy się trafność).
- **Kolejność w karcie trasy**: „👤 Kurier” (pierwsze, otwarte
  domyślnie dopóki nie ma deklaracji) → „🔁 Zamiana kolejności
  rotacji” (tylko N/S/P/U/G) → „📍 Adresy” (na końcu).
- **Historia** — sekcja z minionymi sobotami, rozwijalna, z
  możliwością otwarcia danej soboty w edytorze.
- **Wyszukiwanie głosowe** — przycisk 🎤, domyślnie dopisuje „Słupsk”
  gdy nie podano miasta.
- **Hasło do zapisu** — zwijana sekcja „🔒 Ustawienia”.


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
