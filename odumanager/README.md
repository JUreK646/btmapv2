# ODU Manager (BTMap Companion)

Moduł i narzędzie diagnostyczno-zarządcze dla jednostek zewnętrznych **ODU** (Outdoor Unit) oraz modemów i routerów LTE / 5G (np. ZTE MC889, ZTE MC7010, Huawei B2368, Zyxel NR7101, Nokia FastMile, MikroTik).

## Planowane funkcjonalności:
- **Odczyt parametrów radiowych w czasie rzeczywistym**: RSRP, RSRQ, SINR, RSSI, pasmo podstawowe oraz pasma w agregacji (Carrier Aggregation CA).
- **Identyfikacja stacji bazowej**: automatyczne dopasowywanie odczytanego eNB / gNB, PCI i Cell ID do bazy stacji BTMap i wskazywanie nadajnika na mapie.
- **Wymuszanie pasm (Band Locking)**: wybór i blokowanie preferowanych nośnych LTE i 5G (np. 5G N78 3500 MHz, LTE B7 2600 MHz, LTE B1 2100 MHz, LTE B3 1800 MHz).
- **Blokowanie komórki (Cell / PCI Locking)**: blokowanie połączenia do konkretnego sektora / PCI stacji bazowej bez przełączania na słabsze maszty w okolicy.
- **Wskaźnik optymalnego nakierowania anteny**: pomoc w precyzyjnym ustawieniu azymutu ODU w kierunku masztu na podstawie danych o sektorach z BTMap.
