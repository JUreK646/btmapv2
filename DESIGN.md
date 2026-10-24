---
name: BTMap v2
description: "System wizualny mapy stacji UKE: Manrope, jasne powierzchnie i neutralny czarny motyw."
colors:
  light-accent: "#176f5b"
  light-accent-hover: "#105b49"
  light-accent-soft: "#e5f2eb"
  light-accent-text: "#17624e"
  light-on-accent: "#fff"
  dark-accent: "#f1f1f3"
  dark-accent-hover: "#d4d4d8"
  dark-accent-soft: "#26272b"
  dark-accent-text: "#f4f4f5"
  dark-on-accent: "#101113"
  light-bg: "#f5f6f3"
  light-surface: "#ffffff"
  light-surface-alt: "#f0f3f0"
  light-surface-hover: "#e9efeb"
  light-text: "#222f2b"
  light-muted: "#58675f"
  light-faint: "#5e6d65"
  light-line: "#e4e9e5"
  dark-bg: "#08090b"
  dark-surface: "#121315"
  dark-surface-alt: "#1b1c1f"
  dark-surface-hover: "#27282c"
  dark-text: "#f4f4f5"
  dark-muted: "#acadb4"
  dark-faint: "#999ba4"
  dark-line: "#2a2b30"
  light-danger: "#b63a40"
  light-danger-bg: "#fdf0f0"
  dark-danger: "#ffb2b2"
  dark-danger-bg: "#362123"
  dark-filter-selected: "#f0f0f2"
  operator-orange: "#ff7900"
  operator-t-mobile: "#e20074"
  operator-play: "#6c43bf"
  operator-plus: "#13fb76"
  operator-other: "#788992"
typography:
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
  navigation:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  metadata:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  tag: "4px"
  small: "8px"
  icon: "9px"
  control: "10px"
  search: "12px"
  panel: "14px"
  workspace: "16px"
  dialog: "20px"
spacing:
  tight: "4px"
  compact: "8px"
  control: "12px"
  panel: "16px"
  content: "20px"
  section: "24px"
  page: "36px"
components:
  button-primary:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-primary-hover:
    backgroundColor: "{colors.light-accent-hover}"
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-on-accent}"
  button-secondary:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-text:
    textColor: "{colors.light-accent-text}"
    padding: "3px 0"
  button-icon:
    textColor: "{colors.light-muted}"
    rounded: "{rounded.icon}"
    width: "34px"
    height: "34px"
  search-field:
    textColor: "{colors.light-text}"
    rounded: "{rounded.small}"
    height: "38px"
    padding: "0 10px"
  navigation-item:
    textColor: "{colors.light-muted}"
    typography: "{typography.navigation}"
    rounded: "{rounded.control}"
    padding: "0 13px"
  navigation-item-active:
    backgroundColor: "{colors.light-accent-soft}"
    textColor: "{colors.light-text}"
  operator-chip:
    backgroundColor: "{colors.light-surface-alt}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.control}"
    padding: "6px 7px"
  operator-chip-selected:
    backgroundColor: "{colors.light-accent-soft}"
    textColor: "{colors.light-accent-text}"
  operator-chip-selected-dark:
    backgroundColor: "{colors.dark-accent-soft}"
    textColor: "{colors.dark-accent-text}"
  filter-panel:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.panel}"
    width: "410px"
  filter-panel-compact:
    width: "360px"
  filter-panel-mobile:
    rounded: "{rounded.search}"
    width: "auto"
  info-card:
    backgroundColor: "{colors.light-surface-alt}"
    textColor: "{colors.light-muted}"
    rounded: "{rounded.control}"
    padding: "13px"
  basemap-trigger:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.search}"
    padding: "11px 13px"
---

# Design System: BTMap v2

## Overview

**Creative North Star: "Mapa na pierwszym planie"**

BTMap ma prosty, zaokrąglony interfejs, w którym mapa i dane pozostają najważniejsze. Jasny motyw łączy ciepłe tło, białe powierzchnie i morski akcent. Ciemny motyw korzysta z czerni, neutralnych grafitów i jasnego akcentu; zielone ani granatowe tła nie należą do tego kierunku.

Gęsta, czytelna typografia Manrope, oszczędne linie podziału i niewielkie panele porządkują narzędzia. Cień oddziela kontrolki od treści mapy. Kolory operatorów kodują dane, a etykiety źródeł pozostają widoczne. Układ konkretnego widoku i jego zakres opisuje docs/map-v2.md.

**Key Characteristics:**

- Mapa jako główna powierzchnia pracy.
- Ciepły jasny motyw i neutralny czarny motyw.
- Lokalna rodzina Manrope, zwarte etykiety i liczby tabelaryczne.
- Zaokrąglone kontrolki, płaskie listy i oszczędna liczba kontenerów.
- Kolory operatorów oraz jawne pochodzenie danych.

Dokument opisuje bieżący kod: tokeny i wspólne kontrolki z `src/index.css`, nadrzędny układ z `src/workspace.css`, lokalne fonty z `src/main.tsx`, wybór map z `src/components/BasemapPicker.tsx` oraz wspólną paletę i rozpoznawanie operatorów z `shared/operators.ts`, udostępniane klientowi przez `src/lib/constants.ts`. Importowany po arkuszu workspace plik `src/filters.css` określa lokalny wariant filtrów z `src/components/Filters.tsx` i `src/App.tsx`; jego zakres opisuje `docs/filters-v2.md`. Pozostałości starszego układu nie są nowymi wzorcami systemu.

## Colors

Kolory w nagłówku są normatywne. Prefiksy `light-` i `dark-` opisują dwa warianty tych samych ról CSS; przełączenie motywu ustawia `data-theme` na elemencie głównym.

### Primary

- **Morski akcent:** rodzina `light-accent` obsługuje główne działania, wybrane opcje i fokus. Delikatne tło używa `light-accent-soft`, a tekst na nim `light-accent-text`.
- **Jasny akcent:** rodzina `dark-accent` przenosi te role na neutralną biel. W aktualnym panelu filtrów zaznaczenie łączy grafitowe `dark-accent-soft`, jasny tekst `dark-accent-text` i obramowanie `dark-accent`. Istniejący `dark-filter-selected` odpowiada starszym selektorom filtrów i nie opisuje tego wariantu.

### Neutral

- **Ciepłe tło i białe powierzchnie:** `light-bg` tworzy obudowę, `light-surface` panele, a `light-surface-alt` oraz `light-surface-hover` grupowanie i wskazanie kursorem.
- **Czerń i grafit:** analogiczne role `dark-bg`, `dark-surface`, `dark-surface-alt` i `dark-surface-hover` pozostają neutralne.
- **Tekst:** `text` służy treści głównej, `muted` opisom, a `faint` krótkim etykietom pomocniczym i podpowiedziom pól. `line` tworzy subtelne separatory.

### Semantic and data colors

- **Błąd:** pary `danger` i `danger-bg` łączą czytelny tekst z delikatnym tłem komunikatu.
- **Operatorzy:** `operator-orange`, `operator-t-mobile`, `operator-play`, `operator-plus` i `operator-other` są stałą paletą danych w obu motywach.

Rozpoznawanie nazw źródłowych przypisuje P4 i On Tower Poland do koloru oraz filtra Play, a Polkomtel, Aero2 i Towerlink do Plusa. Nie zmienia to tożsamości podmiotu: oryginalna nazwa SI2PEM pozostaje w dymku. Nieznane nazwy otrzymują kolor Inne. Źródła palety i zakres korekty opisuje `docs/operator-colors-v2.md`.

**The Neutral Dark Rule.** W ciemnym motywie stosuj czarne i neutralne grafitowe powierzchnie oraz jasny akcent. Nie przenoś morskiego zabarwienia jasnego motywu na tło ciemnego.

**The Data Color Rule.** Barwy operatorów służą identyfikacji danych na mapie, w filtrach, legendzie i wykresach. Zachowuj również nazwy operatorów; sam kolor nie wyjaśnia znaczenia.

## Typography

**Body Font:** Manrope z lokalnych pakietów fontów; fallback system-ui, sans-serif. Importowane są zestawy latin i latin-ext oraz wagi (400, 500, 600, 700, 800). Polski tekst nie zależy od zewnętrznego serwera fontów.

Skala jest zwarta i dopasowana do danych, bez odrębnego fontu dekoracyjnego. Role z nagłówka odpowiadają faktycznym elementom: headline nagłówkom stron, title nagłówkom paneli, body treści bazowej, label działaniom, navigation nawigacji, metadata informacjom pomocniczym. Rozmiary nie tworzą narzuconej skali matematycznej.

Nagłówek strony zmniejsza się na telefonie do (24px). Szczegóły stacji mają własny zwarty tytuł adresu (17px, do 760px: 16px; waga 650, interlinia 1.4). Nazwy operatorów mają (13px, waga 700), a ID (10px, waga 500). Tytuł osobnego dialogu raportów ma (15px, na telefonie 14px; waga 650). To lokalne odmiany paneli, bez nowych ról typograficznych w systemie. Bieżący nagłówek obszaru roboczego pozostaje kompaktowy (13px, waga 700). Drobniejsze opisy mapy używają (9–10px); atrybucja dostawcy jest celowo niewielka i mieści się przy krawędzi mapy.

**The Numeric Clarity Rule.** Liczby, współrzędne, znaczniki czasu i liczniki używają cyfr tabelarycznych. Informacje pomocnicze korzystają z tokenów muted lub faint, bez dodatkowego obniżania krycia tekstu.

## Layout

Obudowa aplikacji zajmuje wysokość okna (100dvh); mapa lub wybrany widok wypełnia pozostałe miejsce. Przewijają się treści paneli i stron. Minimalna szerokość obudowy wynosi (320px). Mapa jest kadrowana zaokrągloną ramą; ekran pełny usuwa jej narożniki.

Aktualny widok mapy ma boczny pasek (216px), nagłówek (64px) i zewnętrzny odstęp roboczy (12px). Zwinięty pasek ma (74px). W przedziale (761–1150px) pełny pasek zwęża się do (184px), a wyszukiwarka z (410px) do (360px). Są to reguły tego obszaru roboczego, nie wymagania dla każdej przyszłej strony produktu.

Przy szerokości do (760px) menu staje się wysuwanym panelem (224px), nagłówek ma (58px), a obszar roboczy odstępy (6px). Wyszukiwanie rozciąga się między bocznymi marginesami (12px); licznik i współrzędne przechodzą poniżej niego. Przy otwartych szczegółach lub filtrach pomocnicze kontrolki mapy są ukrywane, aby nie konkurowały z panelem.

Panel listy stacji zachowuje na desktopie szerokość (364px), odsunięcie od prawej (18px), początek (80px) i dolny odstęp (46px). Na telefonie rozciąga się między marginesami (12px), od (70px) do (30px) nad dolną krawędzią. Panele bazy stacji mają pozycję dostosowaną do jej nagłówka i narzędzi.

Szczegóły stacji są lokalnym wyjątkiem: szerokość `min(860px, calc(100% - 36px))`, początek (80px), prawa krawędź (18px) i dolny odstęp (24px). Do szerokości (760px) panel zajmuje miejsce między bocznymi marginesami (12px), od (70px) do (12px) nad dołem. Nagłówek i pojedynczy pasek „Specyfikacja” pozostają widoczne; środek ma `overflow: auto`, a zewnętrzny panel `overflow: clip`, aby przeniesienie fokusu nie przewijało nagłówka. Fakty mają trzy kolumny od (840px), dwie poniżej; na telefonie GPS zajmuje obie kolumny. To reguły tej powierzchni, nie nowy globalny rozmiar panelu.

Raporty SI2PEM otwierają osobny natywny dialog o szerokości `min(1080px, calc(100vw - 40px))` i wysokości `min(720px, calc(100dvh - 40px))`. Nagłówek pozostaje widoczny, a treść przewija się wewnątrz. Układ łączy kolumnę schematów (210px) z elastyczną tabelą. Do (760px) dialog ma boczne marginesy (10px) i pionowe (12px); schemat kierunków i wysokości tworzą wspólny wiersz nad tabelą. Tabela z rzeczywistymi parametrami może przewijać się poziomo. Są to lokalne rozmiary raportu, bez zmiany wspólnych tokenów dialogów.

Panel filtrów jest lokalnym wyjątkiem: szerokość filter-panel przechodzi na filter-panel-compact w przedziale (761–1150px), a do (760px) na filter-panel-mobile między marginesami (12px). Wysokość wynika z treści, bez rozciągania do dolnej krawędzi. Maksymalna wysokość wynosi `calc(100% - 100px)` na mapie oraz `calc(100% - 118px)` w bazie stacji; mobilna baza używa `calc(100% - 186px)`. Gdy brakuje miejsca, przewija się środek, a nagłówek i stopka zachowują wysokość.

Odstępy wynikają z powtarzanych wartości z nagłówka; niewielkie korekty (5–7px, 9–15px, 18px) służą dopasowaniu gęstych kontrolek. Lista i tabela używają separatorów zamiast osobnej karty dla każdej pozycji.

## Elevation & Depth

System łączy płaską obudowę i listy z uniesionymi narzędziami mapy. Wspólny token `--shadow` obejmuje wyszukiwarkę, podkłady, panele, podpowiedzi i powiadomienia. Jego dwa warianty, cień modalny i cień klastra są zapisane w rozszerzeniach sidecara, ponieważ nie należą do schematu frontmatter.

**The Map Overlay Rule.** Cienie oddzielają panele i narzędzia od mapy; listy i tabele opierają się na odstępach, tle oraz cienkich separatorach.

Dialogi korzystają z przyciemnienia tła, a mobilne menu z neutralnej czarnej zasłony. Nie dodawaj rozmycia ani dekoracyjnej poświaty jako domyślnej cechy powierzchni.

## Shapes

Małe znaczniki i etykiety mają najciaśniejsze narożniki; kontrolki są łagodnie zaokrąglone, a większe powierzchnie korzystają z ról search, panel, workspace i dialog z nagłówka. Mobilne obszary robocze i panele przechodzą na promień search; dialog na (17px). Kropki operatorów, lokalizacji i klastry są okrągłe.

Cienka linia (1px) określa pola, filtry i separatory. Aktywna karta zakładki używa dolnego akcentu (2px). Ikony są liniowe, spójne z Lucide; nie zastępują etykiet bez dostępnej nazwy.

## Components

### Buttons

Główne i drugorzędne działania mają minimalną wysokość (40px); wariant w stopce panelu jest mniejszy (36px). Główny przycisk używa accent/on-accent i ciemniejszego lub jasnoszarego wariantu hover właściwego motywowi. Drugorzędny ma powierzchnię oraz cienkie obramowanie. Przycisk tekstowy podkreśla napis po najechaniu; przycisk ikonowy ma kwadratowy obszar (34px).

Zmiana tła, tekstu i cienia trwa (160ms). Widoczny fokus przycisków i odnośników ma obrys akcentu (3px) odsunięty o (3px). Wyłączone kontrolki zmieniają kursor i krycie; opcje podkładów używają krycia (0.65).

### Chips

Operatorzy, technologie i pasma w aktualnym panelu filtrów są kompaktowymi przyciskami o minimalnej wysokości (34px; na telefonie 40px), tekście (11px, waga 600) i narożniku control. Stan niewybrany używa surface-alt; wybrany — accent-soft, accent-text i obramowania accent w obu motywach. Ciemny wariant pozostaje grafitowy z jasnym obrysem. Operator łączy nazwę z kolorową kropką, zastępowaną po wyborze ikoną zaznaczenia w stałym obszarze (12px), bez zmiany rozmiaru przycisku. Fokus ma odsunięcie (2px). Nie myl tych filtrów z niewielkimi, nieinteraktywnymi znacznikami technologii.

### Cards / Containers

Typową kartą informacyjną jest spokojna notatka na surface-alt, bez cienia, z ikoną i tekstem. Panele są większymi kontenerami przewijanej treści, odseparowanymi od mapy cieniem. Dane stacji i wiersze tabel zachowują prostą strukturę z separatorami.

### Inputs / Fields

Standardowe pola mają tło surface, obramowanie line i narożnik control. Fokus używa obrysu akcentu (2px) z odsunięciem (1px). Wyszukiwarka nad mapą osadza pole bez własnej linii w wspólnej powierzchni z przyciskiem filtrów. Jej fokus obejmuje grupę pola, a wyniki rozwijają się pod nią. Formularze na telefonie zwiększają tekst wpisywany do (16px).

### Navigation

W bieżącym obszarze roboczym są trzy widoki: Mapa, Baza stacji, Statystyki. Nawigacja jest pionowa, z minimalną wysokością pozycji (45px), ikoną i etykietą. Aktywna pozycja ma delikatne tło, wyróżnioną ikonę i kropkę. Zwinięcie na desktopie pozostawia ikony; na telefonie otwiera się pełne menu na zasłonie. Konto i informacje pomocnicze pozostają w dolnej części paska.

### Basemap picker

Wybór podkładu otwiera nad przyciskiem panel (306px), zawierający opisane opcje i widoczny wybór. Kliknięcie poza nim, Escape, przycisk zamknięcia lub wybór opcji zamykają panel. Dostępne są OpenStreetMap, Satelita Esri i Mapa terenowa. Google Satellite pozostaje wyłączone do konfiguracji własnego klucza. Opis na dole przypomina, że dane stacji pozostają z UKE.

Podkład uliczny ma osobne filtry dla jasnego i ciemnego motywu. Satelita i topografia zachowują naturalne kolory. Atrybucja dostawcy i skala mapy pozostają przy dolnej krawędzi.

### Station detail panel

Wybór stacji łączy mapę z szerokim panelem parametrów. Zwarty nagłówek pokazuje nazwy operatorów z kolorami danych, ID i „Pozwolenia UKE”, następnie adres, lokalizację, dostępne metadane i znaczniki technologii. Działania to kopiowanie linku oraz zamknięcie. Kopiowanie linku i GPS potwierdza wynik. Filtry i lista współdzielą stan z mapą.

Pojedynczy pasek „Specyfikacja” korzysta z surface-alt i accent-text; nie jest zakładką. Siatka faktów zawiera GPS, województwo, ID oraz „Raporty PEM”. Przycisk „SI2PEM” pokazuje liczbę rzeczywistych sprawozdań i otwiera osobny dialog. Znana liczba pozostaje widoczna podczas ładowania i odświeżania; nieznana pokazuje wielokropek, błąd bez znanej liczby „Sprawdź”, a częściowa lista znak „+”. Błąd i brak metadanych nie stają się zerowym licznikiem. Sposób zapisu i granice weryfikacji opisuje `docs/pem-fast-v2.md`. Opcjonalne notatki, konstrukcja i wysokość pojawiają się tylko z danymi. W tym panelu nie ma komentarzy ani „Zgłoś uwagę”.

Chipy operatorów łączą nazwę i kolor danych, a stan wybrany dodatkowo zaznaczenie oraz accent-soft, accent-text i obrys accent. Wybór zmienia ID operatora i domyślnie otwarte grupy technologii. Każda grupa ma rozwijany nagłówek oraz tabelę pasm i pozwoleń UKE; brak danych ma opis tekstowy.

Dialog „Anteny na stacji” łączy oznaczenie SI2PEM, identyfikację stacji, datę, laboratorium, numer sprawozdania i wybór raportu. Link XLSX prowadzi do oficjalnego zestawienia całej stacji. Schemat kierunków, wysokości i tabela parametrów korzystają wyłącznie z danych jawnie powiązanych z wybranym raportem. Przy braku parametrów pokazują opis braku danych; nie tworzą sektorów ani anten z samych punktów pomiarowych. Rozwijane „Wyniki pomiarów” zawierają odczyty wybranego sprawozdania. Natywny dialog utrzymuje fokus w oknie; zamknięcie i Escape wracają do otwartej stacji. Wczytywanie, błąd z ponowieniem, brak raportów i częściowa lista mają osobne komunikaty.

Ta odmiana korzysta z istniejących tokenów, Manrope i Lucide. Końcową kaskadę określa `src/pem-reports.css`, importowany po `src/station.css` przez `src/btmap.tsx`, oraz `src/components/DetailsPanel.tsx` i `src/components/PemReportsDialog.tsx`. Starsze reguły szczegółów i zakładek nie wyznaczają jej układu. Zakres, zasady powiązania danych i dowody przeglądu: `docs/station-v2.md`.

Wejście panelu przesuwa go o (24px) przez (200ms) z ease-out. Preferencja ograniczonego ruchu usuwa animację i przejścia paneli; globalnie skraca pozostałe animacje do (0.01ms).

### Filter panel

Nagłówek łączy tytuł (16px), etykietę źródła UKE i zamknięcie. Operatorzy, technologie, pasma i województwo są dostępne od razu, bez dodatkowego rozwijania. Przyciski zawijają się w wiersze; pasma mają pięć równych kolumn. Technologie łączą skrót generacji z nazwą. Selektor województwa ma tło surface-alt i wysokość (38px; na telefonie 42px z tekstem 16px).

Stopka z separatorem zawiera licznik lokalizacji oraz działania „Wyczyść” i „Gotowe”. Licznik reaguje na filtry i pokazuje stan wczytywania lub błędu. „Wyczyść” resetuje kryteria i wyłącza opcjonalną warstwę PEM na mapie; jest nieaktywne przy pustym wyborze. „Gotowe” zamyka panel. Działania mają minimalną wysokość (36px; na telefonie 40px). Szczegółowy zakres tej lokalnej odmiany i dowody przeglądu są w `docs/filters-v2.md`.

### PEM map layer

Opcjonalne „Pomiary PEM” rozszerzają istniejący panel filtrów o sekcję „Warstwy mapy” nad operatorami. Wiersz etykiety ma minimalną wysokość (48px), checkbox (18px), tytuł (12px, waga 700) i opis (11px, interlinia 1.5). Włączona warstwa dodaje SI2PEM do etykiety źródła oraz komunikat liczby pomiarów lub stanu pobierania. Filtr operatora dotyczy też pomiarów; pozostałe kryteria nadal opisują stacje UKE.

Pomiar rozpoznaje się po płaskim kwadracie (18 × 18px, obrys 2px, narożnik 2px) we wspólnym kolorze operatora, odmiennym od okrągłego znacznika UKE. Obrys jest biały; jasny motyw używa dla Plusa ciemnego obrysu (#244230), również przy jego okrągłych znacznikach stacji. Interaktywny znacznik Leaflet ma (24 × 24px), nazwę dostępną z klawiatury i fokus (3px, token text, odsunięcie 3px). Nie wprowadza globalnego wzorca przycisku.

Dymek korzysta z surface, text, muted, accent-text, wspólnego shadow i narożnika panel (14px). Treść ma marginesy (19px 21px), Manrope i interlinię (1.5); tytuł operatora (15px, waga 750), etykiety faktów (10px), wartości (12px, waga 600, cyfry tabelaryczne). Przycisk zamknięcia zajmuje (32 × 32px). Widoczne są status źródłowy, adres, ID stacji, laboratorium, akredytacja i planowany termin od–do. Odnośnik prowadzi do oficjalnego raportu, jeżeli jest dostępny, albo wpisu SI2PEM. Planowany termin nie jest datą faktycznego wykonania pomiaru.

Komunikat warstwy nad mapą używa surface, muted i shadow, narożnika (9px), odstępów (10px 12px) oraz tekstu (11px; do 760px: 10px). Jest ukrywany przy otwartym panelu lub szczegółach stacji. Końcowe lokalne reguły są w `src/pem-plans.css`, importowanym po `src/pem-reports.css` przez `src/btmap.tsx`; zachowanie określają `PemPlanMarkers.tsx`, `Filters.tsx`, `MapView.tsx` i `App.tsx`. Retencja, synchronizacja i dowody: `docs/pem-plans-v2.md`. Rozszerzenie zachowuje istniejące tokeny i tożsamość; nie dodaje grafik produktu.

### Asset provenance

Nie jest dostarczana autorska grafika rastrowa. Zdalne kafle OpenStreetMap i Esri, oraz opcjonalnie Google, są treścią dostawców z własną atrybucją. Ikony Lucide oraz geometria SVG/canvas Leaflet są elementami interfejsu. Manrope jest lokalnie dołączonym fontem. Obrazy podkładów nie zastępują źródła danych stacji.

## Do's and Don'ts

### Do:

- Do stosuj tokeny bieżącego motywu do powierzchni, tekstu, obramowań i stanów kontrolek.
- Do zachowuj opisowe polskie etykiety, widoczny fokus i rozpoznawalny stan wybrany.
- Do utrzymuj pochodzenie UKE przy danych stacji oraz osobną atrybucję dostawcy podkładu.
- Do ograniczaj ruch przy prefers-reduced-motion i pozostawiaj przewijanie wewnątrz paneli.
- Do dokumentuj nowe faktyczne wzorce, korzystając z końcowej kaskady CSS.

### Don't:

- Don't wprowadzaj zielonkawego lub granatowego tła do ciemnego motywu.
- Don't dodawaj ozdobnych kart i obramowań wokół każdego fragmentu danych.
- Don't traktuj koloru operatora ani pozwolenia jako potwierdzenia działania stacji lub zasięgu.
- Don't stosuj filtrów ciemnego podkładu ulicznego do zdjęć satelitarnych i topografii.
- Don't opisuj zdalnych kafli mapowych jako autorskich ilustracji BTMap.
