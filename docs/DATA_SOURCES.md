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
  - Antenna azimuths from the UKE permit KML file, where the permit lists them.
* **Update Frequency:** UKE publishes new registry versions irregularly. The server checks the base station registry every 2 hours and the radio link registry every 12 hours, and imports only when the published files have changed.
* **Processing Pipeline:** [`server/ukeSync.ts`](../server/ukeSync.ts) (CLI: [`scripts/sync_uke.ts`](../scripts/sync_uke.ts)), [`server/radiolineSync.ts`](../server/radiolineSync.ts) (CLI: [`scripts/sync_radiolines.ts`](../scripts/sync_radiolines.ts)) and [`scripts/import_kml_azimuths.ts`](../scripts/import_kml_azimuths.ts).

### B. System Informacyjny o Instalacjach Wytwarzających PEM (SI2PEM)
* **Description:** Operated by the National Institute of Telecommunications (Instytut Łączności – Państwowy Instytut Badawczy).
* **Datasets Ingested:**
  - Accredited laboratory measurement reports of electromagnetic fields (PEM) around transmitters, fetched per station when it is opened and cached for 48 hours.
  - Antenna tables read from report PDFs where the layout can be parsed: antenna models, heights above ground (m n.p.t.), azimuths, tilts, EIRP and bands.
  - The schedule of planned measurements, refreshed every 48 hours.
* **Processing Pipeline:** [`server/si2pemSync.ts`](../server/si2pemSync.ts), [`server/pemReports.ts`](../server/pemReports.ts), [`server/pemPdf.ts`](../server/pemPdf.ts) (CLI for the schedule: [`scripts/sync_si2pem.ts`](../scripts/sync_si2pem.ts)).

### C. Główny Urząd Geodezji i Kartografii (GUGiK)
* **Description:** National spatial data infrastructure for Poland.
* **Datasets Used:** Elevation data for the terrain profile and area audit, queried on demand and not stored: the digital terrain model (NMT, LiDAR 1 m) and the digital surface model (NMPT) for buildings and trees. Points are converted from WGS-84 to PUWG 1992 (EPSG:2180) for these queries. When GUGiK does not answer, Copernicus DEM (90 m) via Open-Meteo is used instead.

---

## 3. Data Integrity & Validation Pipeline

Imported registries go through these checks:

1. **All-or-nothing imports:**
   - A UKE registry sync is applied only when every technology file was downloaded and read. A failed file, or a sheet with an unknown column layout, leaves the database unchanged.
   - A radio link registry with an unknown layout or without any links leaves the stored links unchanged.

2. **Geographic sanity checks:**
   - Coordinates outside Poland's extent (roughly 49–55° N, 14–25° E) are skipped.

3. **No filled-in values:**
   - Values the source does not provide (azimuths, link capacity, frequency, polarisation, dates) are stored as missing rather than replaced with typical values.

4. **Co-located operators:**
   - Operators sharing one mast (including the NetWorkS! sharing between Orange and T-Mobile) are kept as separate station records, slightly offset on the map so each one can be selected.

---

## 4. Community Verification & Ground-Truth Feedback

While automated pipelines process official records, real-world cellular deployments may precede regulatory filing updates. Community contributors provide ground-truth observations (e.g., via cell-logging software like NetMonster or field signal analyzers) verified through our [Issue Template](../.github/ISSUE_TEMPLATE/station_correction.yml).
