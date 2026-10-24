# BTMap v2
<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Polskojęzyczna mapa stacji bazowych: wyszukiwanie lokalizacji, porównanie operatorów, technologii i pasm, szczegóły pozwoleń, zgłoszenia społeczności.

## Capabilities and Constraints
Potwierdzone przez użytkownika: mapa BTS, filtry, szczegóły stacji, baza danych, konta i zgłoszenia. Wyłącznie przeglądarka, także na telefonie. Jedynym źródłem stacji jest UKE. Konta służą komentarzom i zgłoszeniom uwag do stacji UKE; moderacja nie tworzy drugiej bazy. Bez zapisywania stacji i przycisku dojazdu. Lokalna wersja do testów. Push i publikacja dopiero po późniejszym poleceniu.

## Brand Commitments
BTMap. Nowoczesny, prosty, zaokrąglony interfejs. Użytkownik zaakceptował jasną kolorystykę. Ciemny motyw ma być czarny i neutralny, bez zielonkawego lub granatowego tła. Ograniczyć ozdobniki i nadmiar pudełek.

## Evidence on Hand
Kod v1 i historyczny KML z pozwoleniami w .local-backup/btmap-before-v2.zip. Właściwej bazy BTMap.db brak w dostarczonym folderze. KML pozwala odtworzyć lokalną bazę; nie świadczy o bieżącym stanie sieci.

## Product Principles
- Pomiary PEM w panelu stacji pochodzą z SI2PEM, są odrębne od parametrów UKE i wymagają powiązania ID oraz lokalizacji. Na polecenie użytkownika panel nie zawiera komentarzy ani zgłaszania uwag.
- Mapa i wyszukiwanie na pierwszym miejscu.
- Pozwolenie nie potwierdza działania stacji ani zasięgu.
- Jawne pochodzenie danych UKE; komentarze i uwagi nie są źródłem parametrów stacji.
- Czytelne błędy i puste wyniki.


## Layout reference · 2026-10-15
Użytkownik wskazał zrzut BTSearch jako inspirację układu, wyraźnie prosząc o własną wersję, a nie kopię. Mapa dominuje; wąska lewa nawigacja ograniczona do Mapa, Baza stacji, Statystyki. Wyszukiwarka i rozwijane filtry nad mapą. Podkłady: OpenStreetMap, satelitarny, terenowy oraz opcjonalne Google Satellite. Zmiana podkładu nie zmienia źródła stacji UKE. Nie dodawać galerii, analizatorów, eksportu CLF ani pozostałych pozycji z referencji.

## Raporty PEM · korekta 2026-10-19
Na późniejsze polecenie użytkownika sekcja Raporty PEM otwiera osobny panel SI2PEM z raportami i układem parametrów anten. Stacje pozostają z UKE. Parametry anten niewystępujące w źródle mają opis braku danych, bez wymyślonych wartości. Komentarze i Zgłoś uwagę są usunięte z tego panelu.

## Harmonogram PEM · 2026-10-19
Użytkownik polecił pobierać rzeczywiste dane SI2PEM z serwerów co 2 dni. W filtrach mapy jest opcjonalna warstwa Pomiary PEM: kwadraty w kolorze operatora, z wykonawcą i planowanymi datami od–do po kliknięciu. Wpisy znikają 7 dni po dacie zakończenia; anulowane nie są pokazywane. Synchronizacja i usuwanie są realizowane przez serwer aplikacji, z trwałym zapisem i nadrobieniem terminu po ponownym uruchomieniu.

## Dokumenty i anteny SI2PEM · dalsza korekta 2026-10-19
Przycisk SI2PEM rozwija kompaktową listę według lat, z datą, rodzajem odnośnika, publikującym i najnowszym raportem. Wewnętrzny panel odczytuje parametry anten wyłącznie z oficjalnych raportów PDF SI2PEM; formularze, także PDF, i inne odnośniki otwiera bezpośrednio przeglądarka. Licznik obejmuje różne oficjalne adresy PDF sprawozdań, bez formularzy, wyszukiwarki i wpisów bez dokumentu; nie zgaduje, czy różne adresy zawierają ten sam raport. Potwierdzony brak to 0, nieznany wynik i błąd nie są zerem, a wynik częściowy ma „+”. Nierozpoznana tabela lub skan mają jawny komunikat i dostęp do PDF. Dokładny zakres i ograniczenia opisuje docs/pem-pdf-v2.md.

## Changelog · 2026-10-19
Na polecenie użytkownika aplikacja ma publiczną podstronę `/btmap/changelog` z całością dotychczasowych zmian BTMap v2, dostępną w pomocniczej części menu. Zbiorczy wpis obejmuje końcowe zachowanie i usunięte funkcje; v2 pozostaje wersją testową. Zakres i dowody: docs/changelog-v2.md.
