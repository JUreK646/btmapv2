# Open Data Governance & Public Registries

This document details the public data registries, legal foundation, ingestion architecture, and verification mechanisms implemented in **BTMap v2**.

---

## 1. Legal Basis & Open Data Foundation

BTMap operates as a civic-tech open-data platform utilizing publicly accessible government registers in accordance with:

* **Polish Open Data Act:** *Ustawa z dnia 11 sierpnia 2021 r. o otwartych danych i ponownym wykorzystywaniu informacji sektora publicznego (Dz.U. 2021 poz. 1641)*.
* **EU Open Data Directive:** *Directive (EU) 2019/1024 of the European Parliament and of the Council on open data and the re-use of public sector information*.
* **Environmental Information Disclosure:** *Ustawa z dnia 3 października 2008 r. o udostępnianiu informacji o środowisku i jego ochronie, udziale społeczeństwa w ochronie środowiska oraz o ocenach oddziaływania na środowisko*.

All public sector information ingested by BTMap is processed for non-commercial and public-interest educational, scientific, and technical analysis.

---

## 2. Integrated Government Registries

### A. Urząd Komunikacji Elektronicznej (UKE)
* **Description:** The official Polish national telecommunications regulator.
* **Datasets Ingested:**
  - Public register of radio frequency spectrum permits for cellular base stations (GSM, UMTS, LTE, 5G NR).
  - Public register of fixed microwave radio relays (*linie radiowe / radiolinie*).
* **Update Frequency:** Monthly official publication cycles.
* **Processing Pipeline:** Handled via [`scripts/sync_uke.ts`](../scripts/sync_uke.ts) and [`scripts/sync_radiolines.ts`](../scripts/sync_radiolines.ts).

### B. System Informacyjny o Instalacjach Wytwarzających PEM (SI2PEM)
* **Description:** Operated by the National Institute of Telecommunications (Instytut Łączności – Państwowy Instytut Badawczy) and the Ministry of Digital Affairs.
* **Datasets Ingested:**
  - Accredited laboratory field measurements of electromagnetic radiation (PEM) around cellular transmitters.
  - Antenna schedules: heights above ground (m n.p.t.), electrical/mechanical tilts, EIRP power levels.
  - Upcoming scheduled environmental EMF inspection notices.
* **Processing Pipeline:** Handled via [`scripts/sync_si2pem.ts`](../scripts/sync_si2pem.ts).

### C. Główny Urząd Geodezji i Kartografii (GUGiK)
* **Description:** National spatial data infrastructure for Poland.
* **Datasets Ingested:**
  - Administrative boundary geometry (PRG).
  - Open spatial basemaps and high-resolution orthophotomaps.

---

## 3. Data Integrity & Validation Pipeline

Before public deployment, raw government datasets undergo automated sanitization:

1. **Geographic Sanity Verification:**
   - Coordinates are validated against bounding boxes for Poland (`Latitude: 49.0° to 54.9° N`, `Longitude: 14.1° to 24.2° E`).
   - Projection transformations from EPSG:2180 (PUWG 1992) to WGS-84 (EPSG:4326) where applicable.

2. **Frequency & Band Normalization:**
   - Raw carrier frequencies in MHz are mapped to standard 3GPP operating bands (e.g., 791–821 MHz $\rightarrow$ LTE B20; 3400–3800 MHz $\rightarrow$ 5G NR n78).

3. **Deduplication & Cross-Referencing:**
   - Physical installations shared by multiple operators (mast-sharing / RAN sharing between Orange, T-Mobile, Play, and Plus) are consolidated to provide an accurate physical site representation.

---

## 4. Community Verification & Ground-Truth Feedback

While automated pipelines process official records, real-world cellular deployments may precede regulatory filing updates. Community contributors provide ground-truth observations (e.g., via cell-logging software like NetMonster or field signal analyzers) verified through our [Issue Template](../.github/ISSUE_TEMPLATE/station_correction.yml).
