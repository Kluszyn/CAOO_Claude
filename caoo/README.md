# Cyfrowy Asystent Ocen Okresowych

Aplikacja według specyfikacji #2. Kod aplikacji jest w `caoo/`, wspólne mechanizmy w `caoo-core/`. Źródła: wyłącznie folder `materiały/` (tylko do odczytu).

| Część | Katalog | Port | Dane |
|---|---|---|---|
| API (FastAPI) | `backend/` | **8001** (`CAOO_PORT`) | `backend/dane/caoo.db` |
| Interfejs (React + Vite) | `frontend/` | **5173** | proxy `/api` → 8001 (`CAOO_API`) |
| Konfiguracja | `konfiguracja/` | — | `korpus.yaml` (manifest źródeł), `reguly/*.yaml` (wersje reguł) |

## Uruchomienie

```sh
# terminal 1: API na http://127.0.0.1:8001 (docs: /docs)
cd caoo/backend && uv sync && uv run caoo

# terminal 2: interfejs na http://127.0.0.1:5173
cd caoo/frontend && npm ci && npm run dev
```

Start API trwa kilkanaście sekund, bo przy starcie powstaje korpus (m.in. pełny tekst ustawy).

## Reguły i panel źródeł

- `konfiguracja/reguly/przepisy-2016.yaml` to jedna wersja przepisów: `wersja`, `obowiazuje_od` (z adnotacją § 14 rozporządzenia) i reguły § 11 z adnotacjami. Nowe przepisy = nowy plik; `wersja_na_dzien()` wybiera wersję obowiązującą w danym dniu.
- Skala § 11 jest zapisana w formacie silnika skali z `caoo-core` (`KonfiguracjaSkali`), więc wynik liczy core: `POST /api/skala/oblicz {"oceny": [9, 9, 9, 1]}` → `NEGATYWNA` (reguła `wynik.negatywna-1pkt`).
- `GET /api/reguly` – panel źródeł: reguła, kategoria, dokument, lokalizator, strona i cytat, ze statusem „cytat w korpusie”.
- `GET /api/zrodla` – dokumenty korpusu; wzory A/B/C w PDF mają status `BRAK_TEKSTU` (brak warstwy tekstowej, bez OCR).

## Mock API kadrowego (#9)

- Dane: `konfiguracja/kadry.yaml`, **fikcyjne** (`demo: true`, odrzucane bez tego znacznika). Stanowiska wyprowadzono z przykładowych arkuszy (`zrodlo_przykladu`).
- 6 osób: kierownik urzędu (A), naczelnik (B), radca (C), główny specjalista po ocenie negatywnej i z naganą, archiwistka na pierwszą ocenę, analityczka z ciągłą nieobecnością ponad miesiąc.
- `GET /api/kadry/pracownicy` – lista, `GET /api/kadry/pracownicy/{id}` – profil: dane, stanowisko, jednostka, zatrudnienie, mianowanie i stopień, przełożony i zastępstwa, opis stanowiska i zadania, poprzednie oceny i zalecenia, nieobecności, uwagi i nagany.
- Kontrakt: `backend/kontrakt/kadry-openapi.json` (wycinek OpenAPI). Po zmianie modeli: `uv run python -m caoo.kadry`; test pilnuje, że plik jest aktualny.

## Wybór procesu i arkusza (#11)

`GET /api/pracownicy/{id}/proces` – rodzaj oceny i arkusz z przesłankami (✓/✗/? z cytatami) według reguł `proces.*` i `arkusz.*` w `przepisy-2016.yaml`:

- mianowanie albo umowa na czas nieokreślony ⇒ ocena okresowa (art. 81 ust. 1), arkusz A (kierownik urzędu), B (kieruje pracownikami) albo C (§ 3 ust. 2–4);
- umowa na czas określony przy pierwszej pracy w służbie cywilnej ⇒ **pierwsza ocena, osobny proces** (art. 37 ust. 1, art. 35 ust. 3), z adnotacją BRAK_ŹRÓDŁA o braku rozporządzenia o pierwszej ocenie;
- brak danych (podstawa zatrudnienia, informacja o pierwszej pracy, cel zatrudnienia przy zastępstwie, liczba podległych) ⇒ „nie można ustalić” z listą brakujących pól, bez zgadywania.

## Kryteria i termin ich ustalenia (#12)

- `GET /api/pracownicy/{id}/kryteria` – kryteria obowiązkowe arkusza (§ 4), propozycje dodatkowych z zadań stanowiska (oznaczenie „propozycja”, uzasadnienie, dopasowane zadania; `FUNKCJA_APLIKACJI`), wykaz pozostałych (zał. 1) i termin ustalenia kryteriów (§ 7: 30 dni, po ocenie negatywnej 7 dni) liczony `wyznacz_termin` z caoo-core, ze śladem i przesunięciem z dnia wolnego.
- `POST /api/pracownicy/{id}/cykle {"dodatkowe": [...]}` – rozpoczęcie cyklu; API odrzuca >3 dodatkowe, powtórzenia, obowiązkowe i spoza wykazu (422), drugi cykl w toku (409), ocenę inną niż okresowa (409).
- `POST /api/cykle/{id}/potwierdzenie {"data": "..."}` – potwierdzenie ocenianego (§ 6 ust. 2) z datą.

## Kalendarz i termin oceny okresowej (#15)

- W widoku **Pracownicy** ustaw datę `21.11.2026` i **Liczba dni** na `6`. Przy Jolancie Jakościowej (K-006) pokaże się termin `27.11.2026`. Rozwiń **Ślad obliczenia**, aby zobaczyć termin bazowy `20.09.2026`, weekend łączący dwa zwolnienia i doliczone 68 dni.
- `GET /api/pracownicy/{id}/proces` zwraca pole `termin_oceny` z datą bazową, obliczonym terminem, połączonymi nieobecnościami i źródłami. Miesięczny próg nieobecności porównuje datę końcową z datą o miesiąc późniejszą od jej początku. Ponowną ocenę po wyniku negatywnym obejmuje #17.
- Administrator zapisuje wyjątki świąteczne jako daty `RRRR-MM-DD` w odpowiedniej wersji `konfiguracja/reguly/`. `terminy.dni_wolne` dodaje dni do algorytmu, a `terminy.dni_robocze` usuwa wskazane daty z wykazu świąt. Soboty i niedziele są dniami wolnymi. Po zapisaniu YAML-a uruchom ponownie API, aby wczytać konfigurację. W interfejsie kalendarz świąt jest oznaczony jako demonstracyjne źródło spoza materiałów.

## Ocena kryteriów i wynik § 11 (#13)

- `GET/PUT /api/cykle/{id}/ocena` – punkty 1/3/5/7/9 (inne → 422), oczekiwania przy kryterium (§ 5 ust. 1 pkt 3) i opis z zał. 1; wynik liczy silnik skali z caoo-core po każdej zmianie: średnia ze wszystkich kryteriów, poziom, wynik, reguła rozstrzygająca z adnotacją i ślad.
- `zatwierdz: true` wymaga kompletu punktów, a przy ocenie negatywnej uzasadnienia (§ 11 ust. 3) – inaczej 422.
- Porównanie z zautomatyzowanym Excelem: `porownanie_excela` (dzielnik 5 wobec średniej z § 11); rozbieżność `excel.dzielnik-sredniej` z adresami formuł jest w panelu źródeł.

## Graf kompetencji (#20)

Otwórz „Graf kompetencji” przy rozpoczętym cyklu. Wybierz ścieżkę i kliknij dowolny węzeł, aby zobaczyć źródło, uzasadnienie, status i zapis zatwierdzenia. Powiązania opisu stanowiska powstają z dopasowanych fraz. Elementy bez trafienia trafiają do weryfikacji.

Graf pokazuje 5 punktów jako roboczy cel do weryfikacji. Poziom aktualny i luka pojawiają się po zapisaniu oceny cząstkowej. Zalecenia z ostatniej oceny zasilają propozycje rozwojowe, a poziom bieżący pochodzi z punktów za konkretne kryterium.

`GET /api/graf/katalog` zwraca wspólny katalog z wersją schematu, kryteriami, poziomami i źródłami działań. `GET /api/cykle/{id}/ocena?z_grafem=true` zwraca również osobne węzły i relacje bieżącej oceny i wymaga dostępu do tego cyklu. Reguły łączenia i katalog działań są w `konfiguracja/graf.yaml`.

## Pytania pomocnicze (#14)

Przy kryterium można zapisać odpowiedzi na pięć pytań oraz dołączyć do każdej odpowiedzi przykład zadania lub notatkę. Propozycja pojawia się po co najmniej trzech odpowiedziach z danymi. Wartości od „Nigdy” do „Zawsze” odpowiadają punktom 1, 3, 5, 7 i 9. System pomija puste odpowiedzi i „Brak danych”. Przy czterech odpowiedziach bierze niższą z dwóch środkowych wartości.

Oceniający może przyjąć propozycję albo wpisać własne punkty z uzasadnieniem. Zapis punktów przelicza wynik formalny. Gdy nowe odpowiedzi zmienią propozycję, dotychczasowe punkty są widoczne, a przed zatwierdzeniem trzeba rozstrzygnąć ewentualne odstępstwo ponownie.

Pytania są w `konfiguracja/metodyki/robocza-v1.yaml`. Cykl przechowuje wersję metodyki. Aby wprowadzić nowe pytania, dodaj plik z osobnym identyfikatorem i ustaw go dla nowych cykli przez `CAOO_METODYKA`. Starsze pliki obsługują zapisane cykle.

## Zmiany w cyklu oceny (#16)

- W rozpoczętym cyklu zapisz **Zmianę stanowiska**. Istotna zmiana obowiązków w ciągu sześciu miesięcy otwiera ponowne ustalenie kryteriów z terminem 30 dni. Wybierz nowe kryteria i ponownie potwierdź zapoznanie. Przy późniejszej istotnej zmianie widok pokazuje okno na sporządzenie oceny dotychczasowych obowiązków.
- **Zmiana oceniającego** zapisuje nową osobę i zachowuje dotychczasowe kryteria.
- Złóż **Wniosek ocenianego o zmianę terminu**. Aplikacja sprawdza, czy upłynęło więcej niż sześć miesięcy. Uwzględnienie wniosku aktualizuje termin w cyklu i profilu oraz dodaje do oceny zawiadomienie PDF do podpisu. Odrzucenie zapisuje decyzję.
- Pytanie o udokumentowanie podstawy zmiany terminu z inicjatywy oceniającego jest w sekcji **Panel źródeł → Braki i pytania do organizatorów**.

## Pytania do rozmowy i notatki (#24)

`GET /api/cykle/{id}/rozmowa` – propozycje pytań do rozmowy oceniającej z szablonów uruchamianych regułami (`konfiguracja/rozmowa.yaml`): zakres z § 10 rozp. 2016 (wymóg przepisu), zadania i wymagania z opisu stanowiska, zalecenia z poprzedniej oceny, niska ocena kryterium (pytania o trudności oraz obciążenie i wsparcie – jako pytania, nie wnioski) i wysoka ocena. Każde pytanie ma uzasadnienie, powiązanie i źródło; pytania aplikacji mają etykietę „funkcja aplikacji — nie wymóg rozporządzenia”. Bez LLM.

`PUT /api/cykle/{id}/rozmowa/pytania` – pytania oceniającego (wybrane z propozycji, zmienione albo własne). `POST /api/cykle/{id}/rozmowa/notatki` – notatka jako dowód (opcjonalnie do pytania lub kryterium); **nie zmienia punktacji**. Pytania do rozmowy są oddzielone od pytań pomocniczych do oceny kryteriów (#14).

## Import przykładowych arkuszy (#18)

W zakładce **Import arkuszy** wybierz formularz z folderu **5. Przykładowe wypełnione formularze oceny**. Importer odczytuje DOCX i PDF z warstwą tekstową. Pokazuje wartości z arkusza obok obliczenia według § 11, błędne daty, niekompletne zaznaczenia i nazwy spoza wykazu.

- W przykładzie **09)** zobaczysz średnią wpisaną 3,3 i obliczoną 3,0.
- W przykładzie **12)** data `14.046.2024` wymaga korekty, a w **13)** pojawia się ostrzeżenie przy nazwie „Negocjacje”.
- W przykładach **1)–5)** wybierz wersje przed lub po zmianie. Pola dat, punktów, wyników i średniej są rozstrzygane przez człowieka. Pozostały tekst jest odczytywany po przyjęciu zmian.

Przycisk **Pobierz dane demo (JSON)** pojawia się po rozstrzygnięciu wersji i usunięciu błędów blokujących. Raport zawiera wartości, lokalizatory i ostrzeżenia. Administrator może też uruchomić z katalogu backendu `uv run python -m caoo.import_arkuszy "NAZWA PLIKU"`, przekazać wybory jako `--wybor "ID=przed"` lub `--wybor "ID=po"` i zapisać gotowy raport do nowego pliku przez `--zapisz raport.json`.

## Pierwsza ocena – osobny proces (#19)

- W profilu osoby, którą wybór procesu (#11) wskazał jako pierwszą ocenę (demo: Anna Archiwalna, K-005), przycisk **Przejdź do ścieżki pierwszej oceny**. `GET /api/pracownicy/{id}/pierwsza-ocena` zwraca ścieżkę; dla innego procesu 409.
- Treść jest w `konfiguracja/pierwsza-ocena.yaml`: elementy z art. 37–38 ustawy z cytatami (termin, oceniający, co bierze się pod uwagę, skutek) i elementy bez podstawy w materiałach z oznaczeniem `BRAK_ŹRÓDŁA` (tryb, wzór arkusza, schemat pól, formularz sprawozdania, warunki wyniku, skala). Status elementu wynika z adnotacji. Zasady oceny okresowej (rozporządzenie 2016, arkusze, kryteria, § 11) nie są kopiowane.
- Okno terminu z art. 38 ust. 1: nawiązanie + 8 miesięcy … koniec umowy 12-miesięcznej − 1 miesiąc (K-005: 01.02.2027–30.04.2027), ze śladem.
- Zakładka **Panel braków** (`GET /api/braki`): wszystkie adnotacje `BRAK_ŹRÓDŁA` z reguł i pierwszej oceny oraz pytania do organizatorów, w tym o brakujący „formularz pierwszej oceny - schemat pól formularza.docx” (w materiałach są tylko pliki blokady Worda `~$rmularz…`).

## Role, uprawnienia i historia zmian (#10)

Przełącznik roli w nagłówku interfejsu loguje kontem demo z `konfiguracja/role.yaml` (hasło `demo`); uprawnienia egzekwuje API (`Authorization: Bearer`, mechanizm `caoo_core.auth`). Bez roli API zwraca 401, bez uprawnienia 403. Publiczne: zdrowie, źródła, reguły, skala.

| Konto | Rola | Widzi i może |
|---|---|---|
| `oceniajacy` | oceniający (K-002, naczelnik) | podwładnych K-003…K-007: cykle, ocena, rozmowa, zmiany w cyklu |
| `zastepca` | oceniający (K-003, radca) | podwładnych K-002 tylko w okresie zastępstwa 1–21.07.2026 (bez siebie) |
| `kierownik` | oceniający (K-001) | K-002 |
| `oceniany` | oceniany (K-004) | tylko własny profil, cykle i ocenę; potwierdza cykl, składa wniosek o zmianę terminu |
| `kadry` | kadry / zarządzający | wszystkich, bez zapisu ocen |
| `admin` | administrator | wszystko, w tym import przykładowych arkuszy |

`GET /api/cykle/{id}/historia` – historia zmian: autor, czas, różnica pól i wersja reguł. Wpis powstaje przy rozpoczęciu cyklu, potwierdzeniu i każdej zmianie danych oceny.

## Mapowanie opisu stanowiska przez LLM (#21)

`GET /api/pracownicy/{id}/mapowanie` – każde zadanie i wymaganie z opisu stanowiska trafia osobno do łańcucha `LlmProvider` (`konfiguracja/mapowanie.yaml`: Anthropic na żywo przy `ANTHROPIC_API_KEY`, inaczej odpowiedzi zapisane). LLM wybiera tylko ID z katalogu kompetencji (#20); odpowiedź z ID spoza katalogu odrzuca `caoo_core.llm`, a bez poprawnej odpowiedzi element jest **„nieprzypisane — wymaga weryfikacji”**. Każda propozycja ma znacznik **„propozycja — wymaga zatwierdzenia”** i **„na żywo / zapisane”**; każde wywołanie trafia do logu `llm.jsonl` (model, wersja promptu, fragmenty, walidacja).

`POST /api/pracownicy/{id}/mapowanie/{zadanie|wymaganie}/{nr}/decyzja` – `ZATWIERDZ`, `ODRZUC` albo `KORYGUJ` (tylko ID z katalogu); zapisuje osobę, datę i wpis w historii elementu. `POST …/mapowanie/odswiez` pyta LLM ponownie tylko dla elementów bez decyzji.

Odpowiedzi zapisane (`konfiguracja/mapowanie-zapisane.json`) **nie pochodzą z modelu** – przygotowano je ręcznie w `mapowanie-demo.yaml` jako zapas dla demo bez klucza API. Po zmianie źródła: `uv run python -m caoo.mapowanie`.

## Rekomendacje i plan rozwoju (#23)

`GET /api/cykle/{id}/rekomendacje` – na grafie z #20: z luk (poziom roboczy wymagany − zaobserwowany) reguła `konfiguracja/rekomendacje.yaml` dobiera działania z katalogu grafu (luka ≥ 4: coaching, warsztaty; luka ≥ 1: szkolenie, samokształcenie; plus działania dla kompetencji). Przy rekomendacji: zadanie, kompetencja, dowody (zalecenia z poprzedniej oceny), poziom oczekiwany i zaobserwowany; każdy element z oznaczeniem **z danych / z reguły / propozycja**. Do tego mocne strony (≥ 7 pkt), realizacja zaleceń z poprzedniej oceny (do omówienia, bez werdyktu) i **ostrzeżenie przy porównaniu okresów** o innych lub nieznanych kryteriach. Niski wynik daje tylko pytanie do rozmowy, nie wniosek o przeciążeniu.

`PUT /api/cykle/{id}/plan-rozwoju` – oceniający ustala działanie, termin, osobę wspierającą i miernik; **treść wniosków do IPRZ pisze człowiek** (API jej nie generuje).

## Aktualizacja przepisów v1 → v2 (#25)

Zakładka **Aktualizacja przepisów** (rola *administrator*, akcja `przepisy.zarzadzaj`):

1. **Wczytaj akt demo (fikcyjny)** → **Wgraj akt**. Samo wgranie nie zmienia aktywnych reguł (`GET /api/reguly` bez zmian).
2. **Analizuj zmiany (LLM)**. Dla każdego parametru z `konfiguracja/aktualizacja.yaml` (granica oceny pozytywnej, limit kryteriów dodatkowych) LLM przez `LlmProvider` z caoo-core zwraca tylko wybór „zmienia” i dosłowne cytaty z aktu i z obecnych przepisów. Bez `ANTHROPIC_API_KEY` działają odpowiedzi zapisane (`konfiguracja/aktualizacja/zapisane.json`, przygotowane ręcznie w `odpowiedzi_demo`, generowane `uv run python -m caoo.aktualizacja`). Nową wartość odczytuje z cytatu wzorzec; administrator ją **przyjmuje** albo poprawia. Przepis aktu bez parametru w konfiguracji (w demo § 10a – rozmowa zdalna) ma flagę „wymaga zmiany aplikacji”.
3. **Zestawienie przed/po**: scenariusze kontrolne według obu wersji (średnia 4,2: pozytywna → negatywna), obszary aplikacji (skala, kryteria i formularze, terminy – co się zmienia) i wpływ na oceny w systemie. Niespójne wartości (np. granica poza przedziałem § 11, limit niecałkowity) i zmiany bez cytatu z aktu są odrzucane.
4. **Opublikuj wersję**. Data obowiązywania domyślnie z aktu („wchodzi w życie z dniem …”); inna wymaga uzasadnienia. Akt z przepisami „wymaga zmiany aplikacji” wymaga potwierdzenia, że nie wejdą do wersji. Wersja i akt trafiają do bazy, przy starcie wracają do listy wersji i do korpusu (cytaty v2 są sprawdzane jak inne). Publikacja trafia do historii zmian.
5. **Zadania decyzyjne**. Zakończone oceny zostają przy swojej wersji reguł. Ocena w toku przy starszej wersji dostaje zadanie, gdy jej wynik lub poziom **może** zależeć od wersji: przy brakujących punktach system sprawdza wszystkie możliwe sumy (z oceną najniższą i bez), więc np. ocena z 1 pkt i średnią na pewno poniżej 2,6 nie dostaje zadania. Zadania są uzgadniane przy publikacji i przy każdym odczycie listy – także dla ocen rozpoczętych po publikacji, przed datą obowiązywania. Wybór wersji wymaga uzasadnienia, można go podjąć zbiorczo, i trafia do historii oceny.

API: `POST /api/przepisy/akty`, `POST …/akty/{id}/analiza`, `PUT …/akty/{id}/propozycje/{parametr}`, `GET …/akty/{id}/zestawienie`, `POST …/akty/{id}/publikacja`, `GET /api/przepisy/zadania`, `POST /api/przepisy/zadania/{id}`, `POST /api/przepisy/zadania/zbiorczo`.

## Cytaty-dowody dla kryterium przez LLM (#22)

`POST /api/cykle/{id}/dowody/{kryterium}/propozycje` – LLM wskazuje dosłowne cytaty z notatek z rozmowy (#24) i przykładów z odpowiedzi na pytania pomocnicze (#14), które dotyczą kryterium (`konfiguracja/dowody.yaml`: Anthropic na żywo przy `ANTHROPIC_API_KEY`, inaczej wszystkie źródła kryterium jako cytaty – bez modelu). Odpowiedź z cytatem bez pokrycia w źródłach odrzuca `caoo_core.llm`; każda odrzucona próba jest pokazana jako **„propozycja odrzucona — brak pokrycia w źródłach”**.

`POST /api/cykle/{id}/dowody/{kryterium}` – oceniający przyjmuje cytat jako dowód (tylko dosłowny); `GET /api/cykle/{id}/dowody` – lista. **Dowody nie zmieniają punktacji.**

## Testy i walidator

```sh
cd caoo/backend
uv run pytest -q
uv run caoo-waliduj --manifest ../konfiguracja/korpus.yaml ../konfiguracja/reguly/*.yaml ../konfiguracja/pierwsza-ocena.yaml ../konfiguracja/aktualizacja.yaml
```

CI (`.github/workflows/caoo.yml`) uruchamia walidator i testy przy PR do `main`. Cytat spoza korpusu kończy walidator kodem 1 (test `test_walidator_pada_przy_cytacie_spoza_korpusu`).

### Test przeglądarkowy sesji roli

```sh
cd caoo/frontend
npm ci && npx playwright install chromium   # raz
npm run test:e2e                             # sam uruchamia vite na 5173; backend niepotrzebny
```

Na Windows wystarczy uruchomić `caoo\frontend\test-e2e.cmd` z cmd albo z PowerShella, z dowolnego folderu. Skrypt instaluje zależności z `package-lock.json`, przeglądarkę dla Playwright z projektu i uruchamia test. Omija blokadę skryptów `npm.ps1` w PowerShellu.

`e2e/sesja-roli.spec.ts` podstawia makietę API w przeglądarce. Logowanie roli startowej najpierw się przeciąga, a potem kończy błędem 503. Test sprawdza, że w tym czasie nie idzie żadne zapytanie o listę pracowników. Ponowienie może być samoczynne albo przyciskiem „Spróbuj ponownie”. Potem następują dwie szybkie zmiany roli (kierownik → kadry), a odpowiedzi logowania wracają w odwrotnej kolejności. Na koniec lista pracowników i kalendarz ocen mają iść z tokenem roli kadry, także po powrocie do widoku i po odświeżeniu strony. Kolejność odpowiedzi ustalają bramki w makiecie, nie opóźnienia czasowe.
