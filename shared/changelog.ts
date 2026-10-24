export const v2Changes = {
  version: '2.1.0',
  from: '2026-10-11',
  to: '2026-10-23',
  sections: [
    {
      id: 'stacje',
      title: 'Dodawanie stacji i komórek dla 4 operatorów',
      items: [
        'Przebudowany interfejs formularza dodawania i edycji stacji bazowych zgodny ze standardem frontend-design (Dark Modern, typografia Manrope, precyzyjne tabelaryczne dane RF).',
        'Dotykowy, bespoke selektor operatora z autentyczną kolorystyką marek: Orange, Play, Plus i T-Mobile z subtelnym podświetleniem glow i wskaźnikiem wyboru.',
        'Pełna weryfikacja parametrów komórek radiowych dla wszystkich 4 sieci (sprawdzanie wyłączności pasm np. B38 Plus, sugerowanie standardowych nośnych EARFCN/NR-ARFCN, walidacja PCI, CID i CLID w czasie rzeczywistym).',
        'Wygodny przycisk „Dodaj stację” w pasku narzędzi i HUDzie mapy umożliwiający szybkie otwarcie kreatora z dowolnego miejsca.',
        'Pełna kompatybilność z automatycznym uzupełnianiem danych z pozwoleń UKE oraz importem azymutów ze sprawozdań SI2PEM.',
      ],
    },
    {
      id: 'audyt',
      title: 'Audyt i ocena operatorów w terenie',
      items: [
        'Nowe narzędzie oceny zasięgu i infrastruktury 4 głównych operatorów (Orange, Play, Plus, T-Mobile) w promieniu do 3 km².',
        'Obiektywna punktacja oparta na rzeczywistych parametrach: odległość od stacji, pasma pojemnościowe i zasięgowe, 5G NR/C-band, wysokość zawieszenia anten oraz ukształtowanie terenu.',
        'Pełne uwzględnienie współpracy NetworkS! – stacje i maszty współdzielone pomiędzy Orange a T-Mobile są poprawnie zaliczane dla obu sieci.',
        'Szczegółowa, rozwijana lista plusów i minusów każdego operatora wraz z rekomendacją najlepszego wyboru w danej lokalizacji.',
        'Wymóg weryfikacji pomiarami SI2PEM – stacje są punktowane na podstawie potwierdzonej, legalnej emisji.',
        'Nowoczesne, estetyczne okno dialogowe w stylu Dark Modern z czytelnym podsumowaniem punktacji.',
      ],
    },
    {
      id: 'azymuty',
      title: 'Azymuty i sektory anten na mapie',
      items: [
        'Nowa warstwa „Azymuty” dostępna w panelu filtrów mapy.',
        'Wizualizacja kierunków promieniowania anten w postaci eleganckich stożków sektorowych z centralną linią celowania.',
        'Precyzyjne etykiety kątów w stopniach (np. 30°, 120°, 240°) umieszczone centralnie wewnątrz wiązki każdego sektora.',
        'Priorytetyzacja rzeczywistych azymutów odczytanych z laboratoryjnych sprawozdań pomiarowych SI2PEM (PDF) oraz deterministyczne wyznaczanie 3 sektorów nominalnych dla pozostałych stacji.',
        'Inteligentne renderowanie przy zbliżeniu (zoom 14+) dla najbliższych stacji bazowych, zapewniające pełną płynność mapy.',
      ],
    },
    {
      id: 'profil-terenu',
      title: 'Profil terenu i propagacja radiowa',
      items: [
        'Interaktywne narzędzie profilu wysokościowego (DEM) pomiędzy stacją bazową a dowolnie wybranym punktem na mapie.',
        'Wizualizacja linii bezpośredniej widoczności (Line of Sight) oraz pierwszej strefy Fresnela (60% i 100%) dla wybranej częstotliwości.',
        'Dokładne obliczenia tłumienia propagacyjnego w wolnej przestrzeni (FSPL) oraz tłumienia wstecznego listka anteny (28 dB Front-to-Back attenuation).',
        'Automatyczna detekcja przeszkód terenowych i zacienienia sygnału radiowego.',
      ],
    },
    {
      id: 'synchronizacja',
      title: 'Automatyczna synchronizacja UKE i SI2PEM',
      items: [
        'Usługa automatycznego sprawdzania i pobierania wykazów pozwoleń radiowych z BIP UKE co 2 godziny w tle.',
        'Skrócenie cyklu synchronizacji harmonogramu i pomiarów SI2PEM z 48 godzin do 2 godzin.',
        'Wygodne polecenia CLI: „pnpm sync:uke” oraz „pnpm sync:si2pem” umożliwiające ręczne lub skryptowe uruchomienie synchronizacji.',
        'Wyeliminowanie z interfejsu technicznego żargonu o buforowaniu – czyste, profesjonalne liczniki stacji i pomiarów w obszarze.',
      ],
    },
    {
      id: 'walidacja',
      title: 'Weryfikacja komórek radiowych',
      items: [
        'Rygorystyczny silnik reguł walidacji parametrów radiowych zgodny z polskim rynkiem telekomunikacyjnym.',
        'Walidacja wyłączności pasm (m.in. dedykowane pasmo B38 dla sieci Plus).',
        'Sprawdzanie identyfikatorów PCI (0–503 dla LTE, 0–1007 dla 5G NR), CLID (1–255), CID (1–65535) oraz automatyczne obliczanie ECI.',
      ],
    },
    {
      id: 'interfejs',
      title: 'Interfejs i ergonomia',
      items: [
        'Inteligentny pasek wyszukiwania: podczas wyszukiwania miejscowości przyciski „Audyt”, „Filtry” i „Dodaj stację” płynnie znikają, oddając 100% szerokości na wpisywanie adresu i wyniki; po zakończeniu lub wyczyszczeniu przyciski płynnie wracają.',
        'Wyeliminowano ucinanie tekstu zastępczego (placeholder) w pasku wyszukiwania na desktopie i telefonach.',
        'Naprawiono błąd zwijania panelu bocznego filtrów na desktopie i telefonach – pełna widoczność wszystkich sekcji.',
        'Przebudowany układ z mapą na pierwszym planie, boczną nawigacją i wyszukiwaniem.',
        'Neutralny czarny motyw ciemny oraz jasny motyw z zapamiętywaniem wyboru.',
        'Pełna responsywność dla komputerów, tabletów i smartfonów.',
        'Obsługa klawiaturą, czytelne stany ładowania i redukcja animacji zgodna z preferencjami systemu.',
      ],
    },
    {
      id: 'mapa',
      title: 'Mapa i podkłady',
      items: [
        'Oficjalne pozwolenia UKE jako jedyne źródło danych infrastruktury telekomunikacyjnej.',
        'Brak sztucznych klastrów – pojedyncze znaczniki stacji na każdym poziomie przybliżenia (do 1000 stacji w kadrze).',
        'Podkłady OpenStreetMap, Satelita Esri, Mapa terenowa oraz opcjonalna warstwa satelitarna Google.',
        'Naturalne odwzorowanie kolorów mapy satelitarnej i hybrydowej w trybie ciemnym.',
      ],
    },
    {
      id: 'filtry',
      title: 'Filtry i kolory operatorów',
      items: [
        'Zintegrowany panel filtrów: warstwy mapy (PEM, Azymuty), operatorzy, technologie (5G, LTE, 3G, 2G, IoT), pasma MHz oraz województwo.',
        'Spójne kolory identyfikacji wizualnej: Orange (pomarańczowy), T-Mobile (magenta), Play (fioletowy), Plus (zielony).',
        'Jednolite przypisanie podmiotów zależnych (P4 / On Tower Poland do Play; Polkomtel / Aero2 / Towerlink do Plusa).',
      ],
    },
    {
      id: 'stacje',
      title: 'Szczegóły stacji i SI2PEM',
      items: [
        'Rozszerzony panel szczegółów z adresem, ID UKE, współrzędnymi GPS i wykazem pozwoleń.',
        'Odrębne sprawozdania SI2PEM dla każdego operatora obecnego na danym obiekcie.',
        'Automatyczny parser parametrów anten z plików PDF: wysokości, azymuty, pasma MHz, tilt (pochylenie) oraz moce EIRP.',
        'Interaktywne diagramy kierunków i zestawienie wysokości anten na stacji.',
      ],
    },
    {
      id: 'baza-konta',
      title: 'Baza stacji i statystyki',
      items: [
        'Szybka wyszukiwarka stacji bazowych odporna na polskie znaki diakrytyczne.',
        'Paginacja wyników i eksport danych do pliku CSV.',
        'Statystyki ogólnopolskie w podziale na operatorów, pasma i województwa.',
      ],
    },
  ],
};
