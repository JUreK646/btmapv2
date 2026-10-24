# Changelog BTMap

## v2.1.0 (2026-10-23)

Aktualizacja rozszerzająca BTMap o zaawansowane narzędzia analizy radiowej, audytu terenu oraz automatyzacji danych.

### Dodawanie stacji i komórek dla 4 operatorów
- Przebudowany interfejs formularza dodawania i edycji stacji bazowych zgodny ze standardem frontend-design (Dark Modern, typografia Manrope, precyzyjne tabelaryczne dane RF).
- Dotykowy, bespoke selektor operatora z autentyczną kolorystyką marek: Orange (#ff7900), Play (#6c43bf), Plus (#13fb76) i T-Mobile (#e20074) z subtelnym podświetleniem glow i wskaźnikiem wyboru.
- Pełna weryfikacja parametrów komórek radiowych dla wszystkich 4 sieci (sprawdzanie wyłączności pasm np. B38 Plus, sugerowanie standardowych nośnych EARFCN/NR-ARFCN, walidacja PCI, CID i CLID w czasie rzeczywistym).
- Wygodny przycisk „Dodaj stację” w pasku narzędzi i HUDzie mapy umożliwiający szybkie otwarcie kreatora z dowolnego miejsca.
- Pełna kompatybilność z automatycznym uzupełnianiem danych z pozwoleń UKE oraz importem azymutów ze sprawozdań SI2PEM.

### Audyt i ocena operatorów w terenie
- Nowe narzędzie oceny zasięgu i infrastruktury 4 głównych operatorów (Orange, Play, Plus, T-Mobile) w promieniu do 3 km².
- Obiektywna punktacja oparta na rzeczywistych parametrach: odległość od stacji, pasma pojemnościowe i zasięgowe, 5G NR/C-band, wysokość zawieszenia anten oraz ukształtowanie terenu.
- Pełne uwzględnienie współpracy NetworkS! – stacje i maszty współdzielone pomiędzy Orange a T-Mobile są poprawnie zaliczane dla obu sieci.
- Szczegółowa, rozwijana lista plusów i minusów każdego operatora wraz z rekomendacją najlepszego wyboru w danej lokalizacji.
- Wymóg weryfikacji pomiarami SI2PEM – stacje są punktowane na podstawie potwierdzonej, legalnej emisji.
- Nowoczesne okno dialogowe w stylu Dark Modern z czytelnym podsumowaniem punktacji.

### Azymuty i sektory anten na mapie
- Nowa warstwa „Azymuty” dostępna w panelu filtrów mapy.
- Wizualizacja kierunków promieniowania anten w postaci eleganckich stożków sektorowych z centralną linią celowania.
- Precyzyjne etykiety kątów w stopniach (np. 30°, 120°, 240°) umieszczone centralnie wewnątrz wiązki każdego sektora.
- Priorytetyzacja rzeczywistych azymutów odczytanych z laboratoryjnych sprawozdań pomiarowych SI2PEM (PDF) oraz deterministyczne wyznaczanie 3 sektorów nominalnych dla pozostałych stacji.
- Inteligentne renderowanie przy zbliżeniu (zoom 14+) dla najbliższych stacji bazowych, zapewniające pełną płynność mapy.

### Profil terenu i propagacja radiowa
- Interaktywne narzędzie profilu wysokościowego (DEM) pomiędzy stacją bazową a dowolnie wybranym punktem na mapie.
- Wizualizacja linii bezpośredniej widoczności (Line of Sight) oraz pierwszej strefy Fresnela (60% i 100%) dla wybranej częstotliwości.
- Dokładne obliczenia tłumienia propagacyjnego w wolnej przestrzeni (FSPL) oraz tłumienia wstecznego listka anteny (28 dB Front-to-Back attenuation).
- Automatyczna detekcja przeszkód terenowych i zacienienia sygnału radiowego.

### Automatyczna synchronizacja UKE i SI2PEM
- Usługa automatycznego sprawdzania i pobierania wykazów pozwoleń radiowych z BIP UKE co 2 godziny w tle.
- Skrócenie cyklu synchronizacji harmonogramu i pomiarów SI2PEM z 48 godzin do 2 godzin.
- Wygodne polecenia CLI: `pnpm sync:uke` oraz `pnpm sync:si2pem` umożliwiające natychmiastową synchronizację.
- Wyeliminowanie z interfejsu technicznego żargonu o buforowaniu i cache – proste, czytelne liczniki stacji i pomiarów w obszarze.

### Weryfikacja komórek radiowych
- Rygorystyczny silnik reguł walidacji parametrów radiowych zgodny z polskim rynkiem telekomunikacyjnym.
- Walidacja wyłączności pasm (m.in. dedykowane pasmo B38 dla sieci Plus).
- Sprawdzanie identyfikatorów PCI (0–503 dla LTE, 0–1007 dla 5G NR), CLID (1–255), CID (1–65535) oraz automatyczne obliczanie ECI.

### Poprawki interfejsu
- Inteligentny pasek wyszukiwania miejscowości i stacji: podczas wpisywania lub skupienia na polu wyszukiwania przyciski „Audyt”, „Filtry” i „Dodaj stację” płynnie się chowają, dając pełną szerokość na wpisywanie adresu i wyniki autouzupełniania; po zakończeniu wyszukiwania lub wyczyszczeniu przyciski płynnie wracają.
- Wyeliminowano ucinanie tekstu zastępczego (placeholder) w pasku wyszukiwania na desktopie i urządzeniach mobilnych.
- Naprawiono błąd zwijania panelu bocznego filtrów do 0px na desktopie i telefonach – pełna widoczność wszystkich sekcji filtrów.
- Usunięcie wewnętrznych komunikatów technicznych z dymków statusu pomiarów PEM.

---

## v2.0.0 (2026-10-20)

Zbiorcze zestawienie zmian w premierowej wersji BTMap v2.

### Nowy interfejs WWW
- Przebudowany układ z mapą na pierwszym planie, boczną nawigacją i wyszukiwaniem nad mapą.
- Neutralny czarny motyw ciemny oraz jasny motyw. Zapamiętywanie wybranego wyglądu.
- Zaokrąglone panele, spójne ikony i czytelna typografia.
- Układ dostosowany do komputera, tabletu i telefonu. Zwijana nawigacja na komputerze i wysuwane menu na telefonie.
- Czytelne stany ładowania, błędów i pustych wyników, obsługa klawiaturą i ograniczenie animacji zgodnie z ustawieniami urządzenia.
- Podstrona Changelog z zestawieniem zmian w v2 i bezpośrednim adresem do udostępnienia.

### Mapa i podkłady
- Wyłącznie stacje z pozwoleń UKE w mapie, wyszukiwaniu, bazie i statystykach. Usunięte źródło BTMap.
- Pojedyncze znaczniki zamiast kółek grupujących stacje. Maksymalnie 1000 stacji w widocznym obszarze na każdym poziomie przybliżenia.
- Filtrowanie przed ograniczeniem wyników. Licznik pokazuje pełną liczbę pasujących lokalizacji, a przybliżenie i filtry pozwalają zobaczyć kolejne.
- Podkłady OpenStreetMap, Satelita Esri i Mapa terenowa. Zapamiętywanie wyboru, skala mapy i oznaczenie dostawcy.
- Google Satellite dodane do wyboru podkładów. Bez skonfigurowanego klucza opcja jest wyłączona z opisem „Chwilowo niedostępne”.
- Satelita i topografia zachowują naturalne kolory także w ciemnym motywie.
- Przybliżanie, lokalizacja użytkownika i pełny ekran mapy na obsługiwanych urządzeniach. Wyszukiwanie miejscowości, adresów, ID i współrzędnych.

### Filtry i kolory operatorów
- Zwarty rozwijany panel z wyborem operatorów, technologii, pasm i województwa, licznikiem wyników i czyszczeniem ustawień.
- Wspólne kryteria mapy i bazy stacji. Operator, technologia i pasmo są sprawdzane łącznie.
- Panel bez filtrów statusu stacji, uplinku i przełącznika źródeł.
- Spójne kolory operatorów: pomarańczowy Orange, magenta T-Mobile, fioletowy Play i zielony Plus.
- Powiązanie P4 i On Tower Poland z Play oraz Polkomtelu, Aero2 i Towerlink z Plusem w kolorach i filtrach. Nazwy podmiotów ze źródła pozostają widoczne.

### Szczegóły stacji
- Nowy szeroki panel z adresem, operatorami, ID, pochodzeniem UKE, współrzędnymi GPS i województwem.
- Najważniejsze informacje o obiekcie pojawiają się tylko wtedy, gdy są dostępne.
- Raporty SI2PEM są rozdzielone według operatora. Liczba i dokumenty każdego operatora są pokazywane osobno.
- Kopiowanie współrzędnych i bezpośredniego linku do stacji z potwierdzeniem wykonania.
- Usunięte zapisane stacje oraz przyciski „Zapisz” i „Dojazd”.
- Usunięte komentarze i „Zgłoś uwagę” z panelu stacji. Specyfikacja i raporty SI2PEM pozostają na pierwszym planie.
- Wyraźna informacja, że pozwolenie UKE nie potwierdza uruchomienia stacji ani rzeczywistego zasięgu.

### Raporty i anteny SI2PEM
- Dokumenty SI2PEM powiązane ze stacją przez identyfikator i lokalizację.
- Rozwijana lista według lat, z datą, typem dokumentu, publikującym i oznaczeniem najnowszego raportu PDF.
- Raporty PDF SI2PEM otwierają osobny panel anten. Formularze zgłoszenia, również w PDF, wyszukiwarka i inne odnośniki otwierają się bezpośrednio w przeglądarce.
- Odczyt z obsługiwanych tabel PDF: modele i producenci anten, wysokości, azymuty, pasma, pochylenia, zakresy regulacji i EIRP. Schemat kierunków, zestawienie wysokości i wskazanie strony źródłowej.
- Identyczne ustawienia anten są pokazane wspólnie, a różnice między pasmami pozostają widoczne. Dostępne punkty pomiarowe można rozwinąć pod tabelą.
- Licznik obejmuje różne dostępne adresy raportów PDF, bez formularzy i wyszukiwarki. Potwierdzony brak to 0; ładowanie, błąd i niepełne dane mają odrębne oznaczenia.
- Skany i nierozpoznane układy PDF mają jawny komunikat oraz dostęp do dokumentu źródłowego. Brakujących parametrów nie zastępują przykładowe dane.

### Pomiary PEM na mapie
- Opcjonalna warstwa „Pomiary PEM” w filtrach, oparta na oficjalnym harmonogramie SI2PEM.
- Kwadratowe znaczniki w kolorze operatora. Po kliknięciu widoczne są wykonawca, planowany termin od–do, lokalizacja i dostępny odnośnik do źródła lub raportu.
- Pomijanie anulowanych wpisów. Pomiary znikają z warstwy po 7 dniach kalendarzowych od daty zakończenia. Błąd źródła zachowuje ostatnie poprawne dane.
- Filtr operatora obejmuje także pomiary PEM. Pozostałe kryteria opisują stacje UKE.

### Baza, statystyki i konta
- Wyszukiwanie w bazie bez konieczności wpisywania polskich znaków, paginacja, przejście do stacji na mapie i eksport bieżącej strony do CSV.
- Statystyki lokalizacji, operatorów, technologii i województw na podstawie pozwoleń UKE.
- Konta i profil użytkownika oraz historia wcześniejszych zgłoszeń. Dostęp do moderacji zależy od uprawnień konta.
- Usprawnione logowanie, profil użytkownika i moderacja dostępna zgodnie z uprawnieniami konta.
- Zgłoszenia użytkowników nie zmieniają treści pozwoleń UKE.

### Większa niezawodność
- Czytelniejsze komunikaty, gdy dane są wczytywane, niedostępne albo nie znaleziono wyników.
- Poprawione działanie mapy, filtrów, podkładów oraz listy dokumentów SI2PEM.
- Dostosowanie interfejsu do węższych ekranów i obsługi klawiaturą.
