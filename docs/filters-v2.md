# Filtry stacji · 2026-10-17

Mode: Operate. Lokalna zmiana istniejącego panelu; zachowana tożsamość BTMap v2.

## Direction contract

THESIS: Zwarty panel do bezpośredniego łączenia filtrów nad mapą. Wszystkie istniejące kryteria są widoczne bez dodatkowego poziomu „Więcej filtrów”.

OWN-WORLD: Manrope, neutralna czerń i grafit w ciemnym wariancie; zaakceptowana biel i morski akcent w jasnym. Kolory operatorów identyfikują dane. Zaokrąglone przyciski z czytelnym stanem zaznaczenia, bez dekoracyjnych kart.

STORY: Użytkownik wybiera jednego lub kilku operatorów, technologie, pasma i opcjonalnie województwo. Mapa oraz licznik wyników reagują od razu. Wyczyść przywraca wszystkie stacje; Gotowe zamyka panel.

FIRST VIEWPORT: Panel szerokości 410 px pod wyszukiwarką; na mniejszym desktopie 360 px, na telefonie między marginesami 12 px. Nagłówek z tytułem, źródłem UKE i zamknięciem. Cztery zwarte grupy, zawsze dostępna stopka z wynikiem oraz działaniami. Wysokość wynika z treści, a na niskich ekranach przewija się środek.

FORM: Bezpośrednie rozwinięcie istniejącego panelu według referencji użytkownika, bez kopiowania układu 1:1. Nie dodawać statusu stacji, uplinku ani przełącznika źródeł. Pozostają funkcje rzeczywiście obsługiwane przez aplikację, bez imitowania narzędzi z cudzej mapy.

SIGNATURE INTERACTION: Wielokrotny wybór i natychmiastowy licznik wyników, z niezmiennym rozmiarem przycisków po zaznaczeniu. Esc zamyka panel. Zmiany respektują ograniczenie ruchu.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

REFERENCE: C:/Users/Jurek/AppData/Local/Temp/codex-clipboard-83a1c9f1-1728-4e43-a80c-681d546424f9.png. Inspiracja gęstością i grupami filtrów; komponent dziedziczy istniejący system BTMap.

## Finish review · 2026-10-17

Disposition: ship. Recenzent końcowy zaakceptował wszystkie pięć wymaganych ujęć i stanów; bez istotnych poprawek. Końcowe dowody: `.impeccable/review/filters/desktop-dark.jpg`, `desktop-light.jpg`, `mobile-dark.jpg`, `mobile-light.jpg` i `user-780-dark.jpg` w tym samym katalogu. Są to zrzuty lokalnej aplikacji z podkładem mapowym dostawcy, ikonami Lucide i fontem Manrope; nie są nowymi autorskimi grafikami produktu.

Dokumentacja `DESIGN.md` i `.impeccable/design.json` opisuje ukończony wariant: szerokość (410px / 360px / auto z marginesami 12px), wysokość zależna od treści, przewijany środek oraz stopka z wynikiem i resetem. Wybrany przycisk w ciemnym motywie ma grafitowe tło i jasny obrys; jasny korzysta z istniejących tokenów. Reguła (364px) pozostaje dla paneli stacji i szczegółów. Nie powstały nowe tokeny kolorów ani nowy globalny kierunek wizualny.
