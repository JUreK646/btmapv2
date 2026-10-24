# Mapa WWW v2

Mode: Operate. Desktop i mobile. Zakres funkcji zatwierdzony przez użytkownika.

## Direction contract
THESIS: Mapa infrastruktury zajmująca niemal całą przestrzeń roboczą; podstawowa nawigacja pozostaje w wąskim bocznym pasku.

OWN-WORLD: Ciepła biel z dotychczasowym morskim akcentem w jasnym motywie; czarne tło i neutralne grafitowe powierzchnie z białym akcentem w ciemnym. Zaokrąglone powierzchnie, Manrope i konsekwentne ikony. Kolory operatorów kodują dane.

STORY: Wyszukaj miejsce, wybierz operatorów i pasma, otwórz stację, porównaj parametry. Mapa i lista współdzielą stan.

FIRST VIEWPORT: Boczny pasek 216 px z marką i trzema widokami: Mapa, Baza stacji, Statystyki. Nagłówek 64 px. Mapa w ramie 16 px, licznik lokalizacji i współrzędne u góry po lewej, wyszukiwarka z filtrami po prawej. Wybór podkładu na dole po lewej; zoom i lokalizacja po prawej. Lista, filtry i szczegóły w rozwijanych panelach, domyślnie schowane. Na telefonie menu boczne otwierane przyciskiem; mapa ma pełną szerokość.

FORM: Układ przypięty przez użytkownika: inspiracja zrzutem BTSearch z 2026-10-15, bez kopiowania marki, rozbudowanego menu i banera. Bezpośrednia implementacja tej referencji z własną typografią i panelem wyboru map. Nie generowano konkurencyjnych koncepcji ani makiet; jawna referencja użytkownika rozstrzyga układ. Launcher kontekstu i detektor niedostępne w tej instalacji.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance


USER STEERING: Użytkownik odrzucił kolorowe ciemne tło i nadmiar ozdobników. Jasna paleta zaakceptowana. Tylko UKE; usunięte zapisane stacje, „Zapisz” i „Dojazd”.

SIGNATURE INTERACTION: Filtry aktualizują listę i mapę; wybór stacji przybliża jej lokalizację i otwiera czytelny panel parametrów.

STATION LIMIT: Mapa pokazuje maksymalnie 1000 pojedynczych stacji w bieżącym obszarze, wliczając zaznaczoną stację. Limit obowiązuje na każdym poziomie przybliżenia; mapa nie grupuje stacji ani nie wyświetla kółek z licznikami. Przy większej liczbie wyników przybliżenie lub filtry pozwalają zobaczyć kolejne lokalizacje. Licznik pokazuje pełną liczbę pasujących lokalizacji.

FILTER PANEL: Zwarty panel operatorów, technologii, pasm i województwa, z natychmiastowym licznikiem wyników oraz czyszczeniem. Bez statusu stacji i uplinku. Szczegółowy zakres i układ: [filters-v2.md](filters-v2.md).

MOTION: Krótka zmiana stanów kontrolek i przesunięcie panelu, animacja mapy zgodna z Leaflet; prefers-reduced-motion ogranicza animacje interfejsu.

REFERENCE: C:/Users/Jurek/AppData/Local/Temp/codex-clipboard-be510756-8879-43ff-920c-96f1f15af343.png (inspiracja, nie wzorzec pikselowy).

MAP STYLES: OpenStreetMap, Esri World Imagery, Esri World Topo Map. Google Satellite korzysta z oficjalnego Map Tiles API po konfiguracji VITE_GOOGLE_MAPS_API_KEY, z dynamiczną atrybucją. Bez klucza opcja jawnie niedostępna. Satelita i topografia zachowują naturalne kolory w obu motywach.
