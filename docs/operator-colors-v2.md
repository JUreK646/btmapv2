# Kolory operatorów · korekta 2026-10-19

MODE: Operate. Precyzyjna korekta kolorów istniejącego interfejsu na polecenie użytkownika, bez zmiany kompozycji.

THESIS: Stacje, pomiary, legenda, filtry i szczegóły korzystają z jednej palety i rozpoznawania nazw źródłowych.

OWN-WORLD: Dotychczasowy jasny i neutralny ciemny motyw, Manrope, istniejące kontrolki. Orange #ff7900, T-Mobile #e20074, Play #6c43bf, Plus #13fb76, Inne #788992.

FIRST VIEWPORT: Istniejąca mapa i filtry. Zmieniają się wyłącznie akcenty operatorów. Jasne zielone znaczniki Plusa mają ciemny obrys w jasnym motywie; ciemny motyw zachowuje jasny obrys.

DATA: Wspólne reguły w shared/operators.ts. Nazwy P4 i On Tower Poland otrzymują kolor Play; Polkomtel, Aero2 i Towerlink otrzymują kolor Plus. Jest to prezentacyjne przypisanie do grupy kolorów i filtrów, nie zmiana oryginalnej nazwy podmiotu. operatorName z SI2PEM pozostaje widoczne w dymku. Jednorazowa migracja poprawia zapisane kategorie pomiarów bez ponownego pobrania danych i bez zmiany dat synchronizacji.

SOURCES: Orange — https://www.orange.pl/static/fe/cms/portal/logos/Master_Logo_RGB.svg (#ff7900). Play — https://media-play.pl/binaries/web/index-BuOEWgd9.css (purple500 #6c43bf; logo używa ciemniejszego #2d0066). Plus — https://www.plus.pl/binaries/content/gallery/plus/plus.svg (#13fb76). Telekom — https://www.telekom.com/resource/blob/1088306/ce44d1cbd78f47f92ddd62def7542c06/dl-cr-bericht-2011-en-data.pdf (#e20074). Powiązania infrastrukturalne On Tower/Play i Towerlink/Polkomtel: https://www.cellnex.com/pl-pl/sections/about-what-we-do-info/.

VERIFICATION: 30 testów, sprawdzenia TypeScript klienta i serwera oraz produkcyjny build przechodzą. Testy obejmują rozpoznawanie pełnych nazw oraz rzeczywistą migrację zapisanych danych po zamknięciu i ponownym otwarciu bazy. Pięć poprawnych dowodów w `.impeccable/review/pem-fast/` obejmuje stację na komputerze w ciemnym motywie, filtry na komputerze w jasnym motywie, stację na telefonie w jasnym motywie, filtry na telefonie w ciemnym motywie i okno użytkownika 638 × 676 px; pozostałe szerokości to 1024 i 390 px. API uruchomiono ponownie z aktualnym kodem. Stan świeżego przeglądu końcowego opisuje `docs/pem-fast-v2.md`. Launcher i detektor były niedostępne we wcześniejszej części tej sesji, bez ponawiania instalacji. Bez nowych grafik produktu.
