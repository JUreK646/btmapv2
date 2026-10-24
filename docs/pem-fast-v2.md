# Szybki licznik SI2PEM · 2026-10-19

Bieżący licznik korzysta z katalogu raportów PDF. Pełny zakres, ograniczenia odczytu i końcowe dowody: [Dokumenty i anteny SI2PEM](pem-pdf-v2.md).

MODE: Operate. Lokalna poprawa szybkości licznika Raporty PEM, z zachowaniem układu panelu.

THESIS: Zapisana liczba raportów jest dostępna niezależnie od pobrania katalogu i odczytu anten z PDF; nie znika podczas odświeżania.

DATA: `pem_report_counts` w SQLite przechowuje count/partial/checkedAt. Lista i szczegóły stacji otrzymują te metadane bez pobierania pełnych raportów. Licznik obejmuje różne oficjalne adresy PDF sprawozdań; formularze, wyszukiwarka i wpisy bez URL nie zwiększają go. Ten sam adres jest liczony raz; różne adresy nie są łączone na podstawie domysłów o treści. Potwierdzony brak to 0, nieznana liczba to wielokropek, błąd bez znanego wyniku to „Sprawdź”, a częściowy wynik ma znak „+”.

CACHE: Klient przechowuje do 40 katalogów i 30 odczytów PDF w RAM, ze świeżością 48 godzin, oraz 250 podsumowań w localStorage pod kluczem v2. Klucze uwzględniają tożsamość i lokalizację stacji. SQLite zachowuje katalog oraz odczyt PDF przez 48 godzin; istniejący harmonogram serwera odświeża wcześniej odwiedzone katalogi, a PDF są odczytywane na żądanie. Jednorazowa migracja unieważniła poprzedni cache XLSX.

INTERACTION: Świeży katalog wraca z pamięci; wygasły zapis może pozostać widoczny podczas odświeżania w tle. Współdzielona operacja ogranicza powtarzane żądania, a klient sprawdza odświeżanie po 10 sekundach. Znany count pozostaje widoczny podczas ładowania. Rozwinięcie SI2PEM pokazuje dokumenty według lat; wybrany raport PDF otwiera panel anten. Pozostałe odnośniki otwierają źródło w przeglądarce.

VERIFICATION: Bieżąca weryfikacja obejmuje 35 testów, TypeScript klienta i serwera oraz końcowy build Vite. Stacja 3799 ma 1 dostępny PDF. Historyczna wartość 2 oznaczała wiersze XLSX i nie opisuje obecnego licznika. Stacja 15809 ma 8 adresów raportów PDF, 5 formularzy i 1 wyszukiwarkę, z `partial: false`. Starsze zrzuty w `.impeccable/review/pem-fast/` dokumentują etap przed katalogiem PDF; końcowe osiem zrzutów i przegląd `ship` opisuje dokument rozszerzenia.

SCOPE: Lokalny kod i cache, bez pushu, commitu i publikacji. System wizualny pozostaje zachowany.
