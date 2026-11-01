# Changelog BTMap

## v2.0.2 (2026-11-01)

Aktualizacja rejestru UKE (26.10.2026), warstwa 38,5 tys. linii radiowych, rozbudowane statystyki telekomunikacyjne i jakość danych, gotowe archiwa KMZ dla Google Earth oraz nowa oś czasu stacji.

### Synchronizacja rejestru UKE i pomiarów SI2PEM
- **Oficjalny wykaz UKE (26.10.2026)**: zaimportowano 61 321 stacji bazowych oraz 516 965 pozwoleń radiowych (GSM, UMTS, LTE, 5G).
- **Dynamiczny parser BIP UKE**: automatyczne dopasowywanie zmieniających się ścieżek plików XLSX na stronach Biuletynu Informacji Publicznej UKE z wykluczeniem zbędnych archiwów tekstowych/CSV.
- **Prawidłowe przypisanie województw**: dekodowanie 100% lokalizacji na podstawie prefiksów TERYT oraz koordynatów GPS.
- **Optymalizacja synchronizacji SI2PEM**: pobieranie harmonogramu i planów pomiarów z inteligentnym filtrem dat i paginacją (`pageSize: 100`).
- **Narzędzia CLI**: zoptymalizowane polecenia `pnpm sync:uke` oraz `pnpm sync:si2pem` z automatycznym inwalidowaniem pamięci podręcznej statystyk.

### Radiolinie UKE (łącza mikrofalowe punkt–punkt)
- **Warstwa radiolinii**: 38 518 oficjalnych linii radiowych UKE w pasmach od 7 GHz do 86 GHz (E-Band) z filtrowaniem według operatora.
- **Szczegółowa karta techniczna przęsła**: częstotliwość, szerokość kanału, polaryzacja (V/H), moc nadajnika (TX), zysk anteny oraz dane decyzji UKE.
- **Wektorowe logotypy i barwy operatorów**: Orange, Play, Plus / Towerlink, T-Mobile, EmiTel, Netia, EXATEL, PGE, Tauron.
- **Automatyczna aktualizacja**: comiesięczna synchronizacja linii radiowych z portalu Dane.gov.pl.

### Rozbudowane statystyki telekomunikacyjne i jakość danych
- **Rozwijane podmenu w nawigacji bocznej**: Rejestr UKE, Radiolinie UKE, Wewnętrzna baza oraz Jakość danych.
- **Matematyczna korekta wykresów udziału**: jednoznaczny podział 100% pozwoleń z równoległym wskaźnikiem penetracji stacji bazowych.
- **Wskaźniki modernizacji sieci**: stacje z agregacją LTE-Advanced (≥3 oraz ≥4 pasma), wdrożenia 5G C-Band 3.6 GHz (n78) vs 5G DSS oraz kolokacje masztów w promieniu 60 m.
- **Analityka radiolinii**: podział pasm ITU, średnie i maksymalne długości przęseł oraz rozkład geograficzny w 16 województwach.
- **Dynamiczne podsumowania**: zasilane bezpośrednio z bazy danych SQLite bez zahardkodowanych wartości.

### Gotowe archiwa KMZ dla Google Earth
- **Dedykowany moduł pobieralni**: pregenerowane paczki stacji bazowych oraz radiolinii gotowe do importu do Google Earth.
- **Podział regionalny**: 16 województw, nowo dodane obiekty oraz paczki ogólnopolskie z rzeczywistymi datami generowania i rozmiarem plików.
- **Wysoka wydajność**: natychmiastowe pobieranie gotowych plików KMZ bez obciążania procesora i bazy serwera w czasie rzeczywistym.

### Historia stacji bazowej i diagramy SI2PEM
- **Oś czasu stacji**: chronologiczna prezentacja rzeczywistych zdarzeń dodania i modyfikacji stacji oraz komórek radiowych.
- **Róża wiatrów SI2PEM**: wyeliminowanie nakładania się etykiet azymutów przy zbliżonych kątach wiązek antenowych.
- **Identyfikator NetWorkS!**: odświeżona stylistyka i zoptymalizowany kontrast odznaki stacji współdzielonych w obu motywach (Dark i Light).
- **Uporządkowanie panelu**: usunięcie zbędnego boksu identyfikatorów komórkowych na rzecz czytelniejszej karty technicznej.

---

## v2.0.1 (2026-10-25)

Pełna lokalizacja w języku angielskim, audyt i ocena operatorów w terenie, stożki azymutów anten, profil terenu DEM ze strefami Fresnela oraz nowy interfejs Dark Modern.

### Dodawanie stacji i komórek dla 4 operatorów
- Przebudowany interfejs formularza dodawania i edycji stacji bazowych zgodny ze standardem frontend-design (Dark Modern, typografia Manrope, precyzyjne tabelaryczne dane RF).
- Dotykowy selektor operatora z autentyczną kolorystyką marek: Orange, Play, Plus i T-Mobile z subtelnym podświetleniem glow i wskaźnikiem wyboru.
- Pełna weryfikacja parametrów komórek radiowych dla wszystkich 4 sieci (sprawdzanie wyłączności pasm np. B38 Plus, sugerowanie standardowych nośnych EARFCN/NR-ARFCN, walidacja PCI, CID i CLID w czasie rzeczywistym).
- Wygodny przycisk „Dodaj stację” w pasku narzędzi i HUDzie mapy umożliwiający szybkie otwarcie kreatora z dowolnego miejsca.

### Audyt i ocena operatorów w terenie
- Narzędzie oceny zasięgu i infrastruktury 4 głównych operatorów (Orange, Play, Plus, T-Mobile) w promieniu do 3 km².
- Obiektywna punktacja oparta na rzeczywistych parametrach: odległość od stacji, pasma pojemnościowe i zasięgowe, 5G NR/C-band, wysokość zawieszenia anten oraz ukształtowanie terenu.
- Pełne uwzględnienie współpracy NetworkS! – stacje i maszty współdzielone pomiędzy Orange a T-Mobile są poprawnie zaliczane dla obu sieci.
- Szczegółowa, rozwijana lista plusów i minusów każdego operatora wraz z rekomendacją najlepszego wyboru w danej lokalizacji.

### Azymuty i sektory anten na mapie
- Nowa warstwa „Azymuty” dostępna w panelu filtrów mapy.
- Wizualizacja kierunków promieniowania anten w postaci eleganckich stożków sektorowych z centralną linią celowania.
- Precyzyjne etykiety kątów w stopniach (np. 30°, 120°, 240°) umieszczone centralnie wewnątrz wiązki każdego sektora.
- Priorytetyzacja rzeczywistych azymutów odczytanych z laboratoryjnych sprawozdań pomiarowych SI2PEM (PDF).

### Profil terenu i propagacja radiowa
- Interaktywne narzędzie profilu wysokościowego (DEM) pomiędzy stacją bazową a dowolnie wybranym punktem na mapie.
- Wizualizacja linii bezpośredniej widoczności (Line of Sight) oraz pierwszej strefy Fresnela (60% i 100%) dla wybranej częstotliwości.
- Dokładne obliczenia tłumienia propagacyjnego w wolnej przestrzeni (FSPL) oraz tłumienia wstecznego listka anteny (28 dB Front-to-Back attenuation).

### Interfejs i lokalizacja
- Przełącznik języka (PL / ENG) w dolnym panelu bocznym z pełnym tłumaczeniem wszystkich widoków, dialogów i narzędzi.
- Inteligentny pasek wyszukiwania rozszerzający się płynnie podczas wpisywania adresu.
- Neutralny czarny motyw ciemny oraz dopracowany jasny motyw z zapamiętywaniem wyboru.

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
