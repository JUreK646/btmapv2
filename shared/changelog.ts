export interface ChangelogSection {
  id: string;
  title: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  isLatest?: boolean;
  from: string;
  to: string;
  title: string;
  summary: string;
  sections: ChangelogSection[];
}

export const releases: ChangelogRelease[] = [
  {
    version: '2.0.3',
    isLatest: true,
    from: '2026-11-01',
    to: '2026-11-08',
    title: 'Najnowsze wykazy BIP UKE (listopad 2026), pełna baza Plusa, azymuty sektorów i ODU Manager',
    summary: 'Najnowsze oficjalne wykazy Rejestru Urządzeń BIP UKE ze stanem na 06.11.2026, kompletna baza 10,9 tys. stacji i 300 tys. sektorów Plusa (Polkomtel), 22 wykazy pozwoleń radiowych UKE, 38,8 tys. linii radiowych, precyzyjne azymuty sektorów oraz nowy moduł ODU Manager.',
    sections: [
      {
        id: 'bip-uke-rejestr-urzadzen-listopad',
        title: 'Rejestr Urządzeń i pozwolenia radiowe BIP UKE (listopad 2026)',
        items: [
          'Oficjalne rejestry urządzeń BIP UKE ze stanem na 6 listopada 2026 r.: zaimportowano zaktualizowane zbiory dla Orange, T-Mobile, Play (04.11.2026) oraz Plusa (28.10.2026) – ponad 768 tys. aktywnych sektorów i komórek.',
          'Pełna baza stacji bazowych Plusa (Polkomtel): włączenie 10 962 stacji i ponad 300 tys. komórek we wszystkich pasmach (GSM 900/1800, UMTS 900/2100, LTE 900/1800/2100/2600 FDD & TDD oraz 5G 700/1800/2100/2600 TDD/3500 TDD).',
          'Wszystkie 22 pliki pasmowe pozwoleń radiowych UKE (stan 26.10.2026 oraz 04.11.2026): zaimportowano 197 289 pozwoleń radiowych (w tym sieci prywatne 5G 3.8–4.2 GHz).',
          'Rzeczywiste azymuty sektorów anten: odczyt i prezentacja kątów promieniowania wiązek antenowych (np. 50° / 170° / 290°) bezpośrednio w karcie stacji i tabeli pasm.',
          'Precyzyjne daty wpisów UKE: wyświetlanie dokładnej daty dokonania wpisu (Wpis UKE: YYYY-MM-DD) z oznaczeniem nowości dla wpisów z października i listopada 2026 r.',
        ],
      },
      {
        id: 'statystyki-przyrostu-listopad',
        title: 'Zaktualizowane statystyki i wykazy przyrostu sieci',
        items: [
          'Nowe okresy w raportach wykazów: „Listopad / Październik 2026 (stan 06.11.2026)”, „Wykaz z 06.11.2026 (Orange, T-Mobile)”, „Wykaz z 04.11.2026 (Play / P4 + 5G)”, „Wykaz z 28.10.2026 (Plus / Polkomtel)” oraz „Wykaz z 26.10.2026 (Pozwolenia + Radiolinie)”.',
          'Pełna korekta zliczania sektorów w 15 kartach pasmowych: kompletne słupki i przyrosty dla wszystkich 4 operatorów.',
          'Najnowszy stan linii radiowych UKE: 38 896 linii radiowych (102 842 kanały transmisyjne) ze stanem na 26.10.2026.',
        ],
      },
      {
        id: 'odu-manager-companion',
        title: 'Nowy moduł ODU Manager (Outdoor Unit Companion)',
        items: [
          'Przygotowanie dedykowanego podprojektu „odumanager/” dla jednostek zewnętrznych LTE/5G (np. ZTE MC889, ZTE MC7010, Huawei B2368, Zyxel NR7101, Nokia FastMile, MikroTik).',
          'Planowana integracja z BTMap: odczyt parametrów sygnału RF w czasie rzeczywistym, wymuszanie pasm (Band Locking), blokowanie komórek (PCI Locking) oraz asystent nakierowania anteny na maszt.',
        ],
      },
    ],
  },
  {
    version: '2.0.2',
    from: '2026-10-24',
    to: '2026-11-01',
    title: 'Aktualizacja wykazu UKE, radiolinie, analityka sieci i ulepszenia interfejsu',
    summary: 'Najnowszy oficjalny wykaz UKE (26.10.2026), ponad 38,5 tys. linii radiowych na mapie, rozbudowane statystyki telekomunikacyjne z rozwijanym menu, pregenerowane archiwa KMZ dla Google Earth oraz precyzyjna historia stacji.',
    sections: [
      {
        id: 'synchronizacja-uke-si2pem',
        title: 'Synchronizacja rejestru UKE i pomiarów SI2PEM',
        items: [
          'Nowy wykaz pozwoleń radiowych UKE ze stanem na 26 października 2026 r. obejmujący 61 321 stacji bazowych oraz 516 965 pozwoleń GSM, UMTS, LTE i 5G.',
          'Dynamiczny parser arkuszy BIP UKE – automatyczna obsługa zmieniających się ścieżek publikacji w portalu Urzędu bez ryzyka pominięcia kolejnych wydań.',
          'Pełne dekodowanie województw z prefiksów kodów TERYT oraz koordynatów GPS – 100% stacji w bazie posiada prawidłowo przypisane województwo.',
          'Zoptymalizowana synchronizacja harmonogramu SI2PEM – inteligentny filtr dat pobiera aktualne i nadchodzące pomiary bez zbędnego pobierania setek archiwalnych stron.',
          'Ujednolicona integracja skryptów CLI „pnpm sync:uke” oraz „pnpm sync:si2pem” z natychmiastowym odświeżaniem pamięci podręcznej statystyk.',
        ],
      },
      {
        id: 'radiolinie-uke',
        title: 'Radiolinie UKE (łącza mikrofalowe punkt–punkt)',
        items: [
          'Nowa, dedykowana warstwa mapy zawierająca 38 518 oficjalnych linii radiowych w pasmach od 7 GHz do 86 GHz (E-Band) z filtrowaniem według operatora.',
          'Szczegółowa karta techniczna łącza mikrofalowego: częstotliwość, szerokość kanału, polaryzacja anteny, moc nadajnika (TX), zysk zysku energetycznego oraz dane decyzji UKE.',
          'Wektorowe logotypy i autentyczne barwy operatorów infrastruktury transmisyjnej (Orange, Play, Plus / Towerlink, T-Mobile, EmiTel, Netia, EXATEL, PGE, Tauron).',
          'Automatyczna comiesięczna synchronizacja linii radiowych z rządowego portalu otwartych danych Dane.gov.pl.',
        ],
      },
      {
        id: 'statystyki-jakosc',
        title: 'Rozbudowane statystyki telekomunikacyjne i jakość danych',
        items: [
          'Nowe rozwijane drzewko w bocznym menu nawigacyjnym: Rejestr UKE, Radiolinie UKE, Wewnętrzna baza oraz Jakość danych.',
          'Korekta matematyczna wykresów kołowych – jednoznaczny podział udziału w ogólnej puli pozwoleń (100%) z równoległą prezentacją penetracji stacji.',
          'Zaawansowane wskaźniki modernizacji sieci: stacje z agregacją LTE-Advanced (≥3 oraz ≥4 pasma), wdrożenia 5G C-Band 3.6 GHz (n78) vs 5G DSS oraz kolokacje masztów w promieniu 60 m.',
          'Pełna analityka infrastruktury radioliniowej w Polsce: podział pasm ITU, średnie i maksymalne długości przęseł oraz rozkład w 16 województwach.',
          'Dynamiczne podsumowanie bazy SQLite bez wpisanych na sztywno liczb w stopce.',
        ],
      },
      {
        id: 'pliki-kmz',
        title: 'Gotowe archiwa KMZ dla Google Earth',
        items: [
          'Dedykowany moduł „Pliki KMZ” z pregenerowanymi paczkami stacji bazowych oraz radiolinii dla aplikacji Google Earth.',
          'Wygodny podział na 16 województw, stacje nowo dodane oraz paczki ogólnopolskie z rzeczywistymi datami i rozmiarami plików na serwerze.',
          'Zoptymalizowany rozmiar archiwów KMZ z natychmiastowym pobieraniem bez obciążania bazy w czasie rzeczywistym.',
        ],
      },
      {
        id: 'historia-i-pem',
        title: 'Historia stacji bazowej i diagramy SI2PEM',
        items: [
          'Przebudowane okno osi czasu historii stacji – elegancka chronologia oparta na rzeczywistych zdarzeniach dodania i edycji komórek radiowych.',
          'Wyeliminowanie nakładania się etykiet azymutów w diagramie róży wiatrów SI2PEM przy zbliżonych kątach promieniowania anten.',
          'Nowy, czytelny identyfikator stacji współdzielonych NetWorkS! zoptymalizowany pod kątem kontrastu w motywach Dark i Light Modern.',
          'Usunięcie zbędnego boksu kalkulatora identyfikatorów komórkowych, co uporządkowało panel szczegółów stacji.',
        ],
      },
    ],
  },
  {
    version: '2.0.1',
    from: '2026-10-11',
    to: '2026-10-23',
    title: 'Baza stacji BTMap, audyt operatorów, azymuty i profile terenu',
    summary: 'Nowy interfejs Dark Modern, formularz dodawania stacji, audyt 4 operatorów w terenie, stożki azymutów anten i profil terenu ze strefami Fresnela.',
    sections: [
      {
        id: 'v201-stacje',
        title: 'Dodawanie stacji i komórek dla 4 operatorów',
        items: [
          'Przebudowany interfejs formularza dodawania i edycji stacji bazowych zgodny ze standardem frontend-design (Dark Modern, typografia Manrope, precyzyjne tabelaryczne dane RF).',
          'Dotykowy, bespoke selektor operatora z autentyczną kolorystyką marek: Orange, Play, Plus i T-Mobile z subtelnym podświetleniem glow i wskaźnikiem wyboru.',
          'Pełna weryfikacja parametrów komórek radiowych dla wszystkich 4 sieci (sprawdzanie wyłączności pasm np. B38 Plus, sugerowanie standardowych nośnych EARFCN/NR-ARFCN, walidacja PCI, CID i CLID w czasie rzeczywistym).',
          'Wygodny przycisk „Dodaj stację” w pasku narzędzi i HUDzie mapy umożliwiający szybkie otwarcie kreatora z dowolnego miejsca.',
        ],
      },
      {
        id: 'v201-audyt',
        title: 'Audyt i ocena operatorów w terenie',
        items: [
          'Nowe narzędzie oceny zasięgu i infrastruktury 4 głównych operatorów (Orange, Play, Plus, T-Mobile) w promieniu do 3 km².',
          'Obiektywna punktacja oparta na rzeczywistych parametrach: odległość od stacji, pasma pojemnościowe i zasięgowe, 5G NR/C-band, wysokość zawieszenia anten oraz ukształtowanie terenu.',
          'Pełne uwzględnienie współpracy NetworkS! – stacje i maszty współdzielone pomiędzy Orange a T-Mobile są poprawnie zaliczane dla obu sieci.',
          'Szczegółowa, rozwijana lista plusów i minusów każdego operatora wraz z rekomendacją najlepszego wyboru w danej lokalizacji.',
        ],
      },
      {
        id: 'v201-azymuty',
        title: 'Azymuty i sektory anten na mapie',
        items: [
          'Nowa warstwa „Azymuty” dostępna w panelu filtrów mapy.',
          'Wizualizacja kierunków promieniowania anten w postaci eleganckich stożków sektorowych z centralną linią celowania.',
          'Precyzyjne etykiety kątów w stopniach (np. 30°, 120°, 240°) umieszczone centralnie wewnątrz wiązki każdego sektora.',
          'Priorytetyzacja rzeczywistych azymutów odczytanych z laboratoryjnych sprawozdań pomiarowych SI2PEM (PDF).',
        ],
      },
      {
        id: 'v201-profil',
        title: 'Profil terenu i propagacja radiowa',
        items: [
          'Interaktywne narzędzie profilu wysokościowego (DEM) pomiędzy stacją bazową a dowolnie wybranym punktem na mapie.',
          'Wizualizacja linii bezpośredniej widoczności (Line of Sight) oraz pierwszej strefy Fresnela (60% i 100%) dla wybranej częstotliwości.',
          'Dokładne obliczenia tłumienia propagacyjnego w wolnej przestrzeni (FSPL) oraz tłumienia wstecznego listka anteny (28 dB Front-to-Back attenuation).',
        ],
      },
      {
        id: 'v201-interfejs',
        title: 'Interfejs, wyszukiwanie i motywy',
        items: [
          'Inteligentny pasek wyszukiwania rozszerzający się płynnie podczas wpisywania adresu.',
          'Neutralny czarny motyw ciemny oraz dopracowany jasny motyw z zapamiętywaniem wyboru.',
          'Pełna responsywność dla komputerów, tabletów i smartfonów.',
          'Rygorystyczny silnik walidacji parametrów radiowych zgodny z polskim rynkiem telekomunikacyjnym.',
        ],
      },
    ],
  },
];

// Backwards compatibility alias for components importing v2Changes
export const v2Changes = releases[0];
