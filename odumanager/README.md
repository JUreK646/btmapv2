# ODU Manager — Cyfrowy Polsat / Plus (Zygmunt Solorz)

Niezależne narzędzie diagnostyczno-zarządcze dedykowane dla autorskich zestawów antenowo-routerowych **ODU-IDU** Grupy Polsat Plus / Cyfrowy Polsat (zestawy ODU-IDU 100, ODU-IDU 200, ODU-IDU 300 oraz nowsze rozwiązania ODU 5G/LTE).

---

## 🛰️ Obsługiwane urządzenia:
1. **ODU-IDU 300** (LTE-Advanced z agregacją pasm 2CA/3CA: B1 2100 MHz, B3 1800 MHz, B7 2600 MHz, B8 900 MHz, B20 800 MHz, B38 2600 MHz TDD)
2. **ODU-IDU 200** (LTE B3 1800 MHz, B8 900 MHz, B20 800 MHz)
3. **ODU-IDU 100** (Pierwsza generacja zestawów LTE Cyfrowego Polsatu)

---

## 🎯 Główne cele projektu:
- **Odczyt telemetrii z ODU w czasie rzeczywistym**:
  - Domyślny adres bramy IDU: `http://192.168.0.1` (lub `192.168.1.1`).
  - Poziomy sygnału z zewnętrznej anteny ODU: **RSRP**, **RSRQ**, **RSSI**, **SINR**.
  - Identyfikatory sieci komórkowej: **eNodeB ID**, **Cell ID**, **PCI**, **TAC**, kod operatora (`260 01` Plus / Polkomtel).
  - Diagnostyka instalacji jednokablowej (zasilanie ODU przez kabel koncentryczny TV-SAT, status połączenia ODU-IDU).

- **Wymuszanie i blokowanie pasm LTE Plusa**:
  - Wymuszanie najszybszych pasm pojemnościowych (np. tylko **B7 2600 MHz** + **B3 1800 MHz** + **B1 2100 MHz**) z wykluczeniem wolnego, zapchanego pasma B20 800 MHz.
  - Wymuszanie pracy w pasmach TDD (B38 2600 MHz) wykorzystywanych w sieci Plusa / Aero2.

- **Identyfikacja masztu Plusa**:
  - Tłumaczenie parametrów eNodeB i Cell ID z ODU na konkretną stację bazową Plusa (miejscowość, adres masztu, azymut sektora).

- **Automatyczny watchdog i restart ODU**:
  - Wykrywanie utraty agregacji pasm lub zawieszenia modemu zewnętrznego i automatyczny restart przez API routera IDU.
