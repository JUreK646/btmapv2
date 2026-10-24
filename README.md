# BTMap v2 📡🇵🇱

[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-blue.svg)](https://github.com/JUreK646/btmapv2)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **[PL]** Otwarty, społecznościowy projekt interaktywnej mapy oraz bazy stacji bazowych telefonii komórkowej (BTS / GSM / UMTS / LTE / 5G) w Polsce.  
> **[EN]** An open-source, community-driven interactive map and database of cellular base transceiver stations (BTS / GSM / UMTS / LTE / 5G) in Poland.

---

## 🌐 Język / Language
- [Polski (PL)](#-opis-projektu-polski)
- [English (EN)](#-project-overview-english)

---

# 🇵🇱 Opis Projektu (Polski)

**BTMap v2** to nowoczesna, otwarta platforma internetowa stworzona z myślą o pasjonatach telekomunikacji, inżynierach radiowych (RF), instalatorach oraz wszystkich osobach zainteresowanych infrastrukturą sieci komórkowych w Polsce.

Projekt integruje oficjalne dane regulacyjne i środowiskowe, umożliwiając wygodne przeglądanie, wyszukiwanie, filtrowanie i analizę stacji bazowych (BTS) wszystkich operatorów komórkowych działających w Polsce.

### 📶 Obsługiwane Sieci i Operatorzy
Aplikacja obejmuje infrastrukturę czterech głównych operatorów infrastrukturalnych w Polsce:
* 🟠 **Orange Polska**
* 🟣 **Play (P4)**
* 🟢 **Plus (Polkomtel)**
* 🔴 **T-Mobile Polska**
* Oraz sieci wirtualne (MVNO), stacje dedykowane, sieci kolejowe (GSM-R) i służb ratunkowych.

### 📡 Technologie i Pasma Radiowe
* **2G (GSM):** GSM 900, GSM 1800
* **3G (UMTS / WCDMA):** U900, U2100
* **4G (LTE / LTE-Advanced):** B20 (800 MHz), B8 (900 MHz), B3 (1800 MHz), B1 (2100 MHz), B7 (2600 MHz), B38 (2600 MHz TDD)
* **5G (5G NR - Sub-6 GHz oraz C-Band):** n1 (2100 MHz DSS), n28 (700 MHz), n38 (2600 MHz TDD), **n78 (3.5 GHz C-Band / 3400-3800 MHz)**

---

### 🚀 Główne Funkcjonalności

1. **Interaktywna Mapa Stacji BTS:**
   * Zaawansowane klastrowanie i płynne przeglądanie tysięcy stacji w całej Polsce.
   * Filtrowanie według operatora, generacji sieci (2G/3G/4G/5G), konkretnych pasm częstotliwości oraz województw.
   * Promienie azymutów anten sektorowych z wizualizacją kierunków emisji fal radiowych.
   * Różnorodne podkłady mapowe (OpenStreetMap, CartoDB Dark/Light, zdjęcia satelitarne, hybryda).

2. **Wyszukiwarka i Szczegóły Lokalizacji:**
   * Błyskawiczne wyszukiwanie miejscowości, adresów, identyfikatorów stacji (Station ID) oraz kodów eNB / gNB.
   * Prezentacja współdzielonych lokalizacji (wspólne maszty kilku operatorów na jednym obiekcie).
   * Pełna karta stacji: parametry radiowe, współrzędne GPS, wysokość zawieszenia anten n.p.t.

3. **Integracja z Rejestrami Publicznymi:**
   * **UKE (Urząd Komunikacji Elektronicznej):** Oficjalny wykaz pozwoleń radiowych dla stacji bazowych.
   * **SI2PEM (Instytut Łączności):** Pomiary poziomów pól elektromagnetycznych (PEM), oficjalne sprawozdania z badań akredytowanych laboratoriów, dane o antenach odczytane bezpośrednio z dokumentacji technicznej PDF.
   * **Warstwa planowanych pomiarów PEM:** Informacje o nadchodzących pomiarach wraz z terminem i wykonawcą.

4. **Społeczność i Edycja Danych:**
   * Możliwość zgłaszania i dodawania nowych stacji przez społeczność z podziałem na sektory i azymuty.
   * Historia zmian i aktualizacji bazy dostępna w aplikacji (`/btmap/changelog`).

---

### 💻 Wymagania i Uruchomienie

* **Node.js:** Wersja `>= 24.0.0`
* **Menedżer pakietów:** `pnpm` (lub `npm`)

```bash
# 1. Klonowanie repozytorium
git clone https://github.com/JUreK646/btmapv2.git
cd btmapv2

# 2. Instalacja zależności
pnpm install

# 3. Uruchomienie w trybie developerskim (Web + Backend)
pnpm dev
```
Aplikacja otworzy się pod adresem: `http://127.0.0.1:5174/btmap`

#### Dostępne Skrypty:
* `pnpm dev` – uruchamia równolegle serwer backendowy API oraz frontend Vite.
* `pnpm build` – buduje zoptymalizowaną produkcyjną wersję aplikacji.
* `pnpm typecheck` – sprawdza poprawność typów TypeScript (frontend i backend).
* `pnpm sync:uke` – automatyczna synchronizacja bazy pozwoleń UKE.
* `pnpm sync:si2pem` – synchronizacja raportów i pomiarów z bazy SI2PEM.

---

# 🇬🇧 Project Overview (English)

**BTMap v2** is an open-source web platform engineered for telecom professionals, RF engineers, antenna installers, and radio enthusiast communities tracking cellular infrastructure in Poland.

The application aggregates regulatory and environmental open data, offering an intuitive, high-performance interface for searching, filtering, and analyzing cellular Base Transceiver Stations (BTS).

### 📶 Supported Networks & Carriers
* 🟠 **Orange Polska**
* 🟣 **Play (P4)**
* 🟢 **Plus (Polkomtel)**
* 🔴 **T-Mobile Polska**
* Virtual operators (MVNOs), mission-critical networks, and railway communications (GSM-R).

### 📡 Technologies & Frequency Bands
* **2G (GSM):** 900 MHz, 1800 MHz
* **3G (UMTS / WCDMA):** 900 MHz, 2100 MHz
* **4G (LTE / LTE-Advanced):** B20 (800 MHz), B8 (900 MHz), B3 (1800 MHz), B1 (2100 MHz), B7 (2600 MHz), B38 (2600 MHz TDD)
* **5G (5G NR - Sub-6 & C-Band):** n1 (2100 MHz DSS), n28 (700 MHz), n38 (2600 MHz TDD), **n78 (3.5 GHz C-Band / 3400-3800 MHz)**

---

### 🌟 Key Features

1. **Interactive Cellular Map:**
   * Smooth, high-performance clustering of tens of thousands of cell towers across Poland.
   * Multi-criteria filtering by carrier, radio access technology (2G/3G/4G/5G), bands, and administrative regions.
   * Visual sector beam azimuth rays showing radiation directions.
   * Multiple map layers (OpenStreetMap, CartoDB Dark/Light, Satellite imagery).

2. **Search Engine & Site Details:**
   * Rapid search by city, address, station code, or eNB / gNB identifier.
   * Multi-carrier co-location detection (shared masts/rooftops).
   * Comprehensive site cards with technical parameters, GPS coordinates, and antenna ground heights.

3. **Public Regulatory Registry Sync:**
   * **UKE (Office of Electronic Communications):** Official telecommunications radio permits.
   * **SI2PEM (National Institute of Telecommunications):** Public electromagnetic field (EMF) environmental measurement reports and antenna specs extracted from official lab documentation.
   * **Scheduled EMF Measurements Layer:** Visibility into planned measurements, certified testing labs, and dates.

4. **Community Contributions:**
   * Community-driven BTS verification and station submissions with sector/azimuth configurations.
   * Comprehensive changelog accessible directly in the app at `/btmap/changelog`.

---

### 🚀 Getting Started

* **Prerequisites:** Node.js `>= 24.0.0` and `pnpm` (or `npm`).

```bash
# 1. Clone the repository
git clone https://github.com/JUreK646/btmapv2.git
cd btmapv2

# 2. Install dependencies
pnpm install

# 3. Start development server (Web + Backend API)
pnpm dev
```
Open `http://127.0.0.1:5174/btmap` in your browser.

#### Available Scripts:
* `pnpm dev` – Starts development backend server and Vite frontend concurrently.
* `pnpm build` – Compiles TypeScript and builds optimized production bundles.
* `pnpm typecheck` – Validates TypeScript types across frontend and backend.
* `pnpm sync:uke` – Syncs latest UKE radiocommunication permits.
* `pnpm sync:si2pem` – Syncs environmental EMF measurement reports from SI2PEM.

---

## 🛠️ Tech Stack

* **Frontend:** React 18, TypeScript 5.7, Vite 6, Leaflet & React-Leaflet, Lucide Icons, Manrope Font
* **Backend:** Node.js 24, Express 5, TypeScript
* **Data Processing:** PDF.js (PEM document parser), Read-Excel-File, Python KML/KMZ scripts
* **Database / Cache:** SQLite / In-memory spatial index

---

## 🤝 Contributing / Współpraca

Wszelkie usprawnienia, poprawki błędów i nowe funkcje są mile widziane!
1. Sforkuj repozytorium
2. Stwórz gałąź dla nowej funkcji (`git checkout -b feature/nowa-funkcja`)
3. Zatwierdź zmiany (`git commit -m "Dodano nową funkcję"`)
4. Wypchnij gałąź (`git push origin feature/nowa-funkcja`)
5. Otwórz Pull Request

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
