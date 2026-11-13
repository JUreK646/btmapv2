import type { DatabaseSync } from 'node:sqlite';
import { haversineDistanceKm, calculateBearingDeg, calculateTerrainProfile } from './terrainProfile.ts';
import { withPemCounts, normalizeTower } from './query.ts';
import { getCachedPdfAzimuths, resolveTowerAzimuths } from './azimuths.ts';
import type { Tower, Operator } from '../src/types.ts';

export interface AreaEvaluationRequest {
  centerLat: number;
  centerLng: number;
  radiusM?: number; // Target area radius in meters (default 500m, max ~977m for 3.0 km²)
  areaKm2?: number; // Target area surface in km² (max 3.0 km²)
  targetName?: string; // Optional building, parcel or address label
}

import type { ServingStationInfo, OperatorEvaluation, AreaEvaluationResult } from '../src/types.ts';
export type { ServingStationInfo, OperatorEvaluation, AreaEvaluationResult };

const MAJOR_OPERATORS = ['Orange', 'Play', 'Plus', 'T-Mobile'] as const;
type MajorOperator = typeof MAJOR_OPERATORS[number];

function bandFreqMhz(b: unknown): number {
  const m = String(b || '').replace(/^[2345]g\b/i, '').match(/\d{3,4}/) || String(b || '').match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Used for the line-of-sight calculation only when a station has no recorded antenna height; always reported as assumed. */
const ASSUMED_ANTENNA_HEIGHT_M = 38;
/** Half of a category's points, given when the input it needs is unknown, so missing data neither rewards nor punishes. */
const NEUTRAL = { los: 9, sector: 10, height: 4 };

export async function evaluateAreaCoverage(
  db: DatabaseSync,
  req: AreaEvaluationRequest,
  fetcher: typeof fetch = fetch
): Promise<AreaEvaluationResult> {
  const centerLat = Number(req.centerLat);
  const centerLng = Number(req.centerLng);

  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || centerLat < 49 || centerLat > 55 || centerLng < 14 || centerLng > 25) {
    throw new Error('Nieprawidłowe współrzędne geograficzne na terytorium Polski.');
  }

  // Calculate area & clamp radius to maximum 3.0 km²
  const requestedRadiusM = Math.max(50, Math.min(2000, Number(req.radiusM) || 500));
  const rawAreaKm2 = req.areaKm2 ?? Math.PI * ((requestedRadiusM / 1000) ** 2);
  const areaKm2 = Math.round(Math.min(3.0, rawAreaKm2) * 100) / 100;
  const radiusM = Math.min(requestedRadiusM, Math.round(Math.sqrt((3.0 * 1_000_000) / Math.PI)));

  // Search candidate towers within 7.5 km of the target location
  const searchDistKm = 7.5;
  const dLat = searchDistKm / 110.574;
  const dLng = searchDistKm / (111.32 * Math.cos(centerLat * (Math.PI / 180)));

  const minLat = centerLat - dLat;
  const maxLat = centerLat + dLat;
  const minLng = centerLng - dLng;
  const maxLng = centerLng + dLng;

  const rawRows = db.prepare(`
    SELECT * FROM towers
    WHERE status = 'APPROVED'
      AND lat BETWEEN ? AND ?
      AND lng BETWEEN ? AND ?
  `).all(minLat, maxLat, minLng, maxLng) as Record<string, unknown>[];

  const towers = withPemCounts(db, rawRows.map(row => normalizeTower(row))) as unknown as Tower[];
  const pdfAzimuths = getCachedPdfAzimuths(db);

  // Group candidate stations by operator and evaluate in parallel
  const evaluations: OperatorEvaluation[] = await Promise.all(
    MAJOR_OPERATORS.map(async (opName): Promise<OperatorEvaluation> => {
      // NetWorkS! (N!) rule: Orange and T-Mobile operate a shared radio access network across Poland.
      // Under NetWorkS!, where Orange has infrastructure, T-Mobile shares the mast/antennas, and vice versa.
      const isNetworksOp = opName === 'Orange' || opName === 'T-Mobile';
      const partnerOp = opName === 'Orange' ? 'T-Mobile' : 'Orange';

      // Find all towers that carry this operator or its NetWorkS! partner
      const opTowers = towers.filter(t => {
        if (t.operators.some(o => o.name === opName)) return true;
        if (isNetworksOp && t.operators.some(o => o.name === partnerOp)) return true;
        return false;
      });

      // Every station of the operator in the UKE registry (permits and device register) is evaluated.
      // An SI2PEM measurement report is extra confirmation that counts in its favour, not a requirement.
      const hasPemReport = (t: Tower) => {
        const directSummary = t.pemReportsByOperator?.[opName];
        if (directSummary && directSummary.count > 0) return true;
        if (isNetworksOp) {
          const partnerSummary = t.pemReportsByOperator?.[partnerOp];
          if (partnerSummary && partnerSummary.count > 0) return true;
        }
        return false;
      };
      const si2pemTowers = opTowers.filter(hasPemReport);
      const withoutPemCount = opTowers.length - si2pemTowers.length;

      if (opTowers.length === 0) {
        // Not rated: no station of this operator nearby, so no points and no grade are made up.
        return {
          operator: opName,
          rated: false,
          score: 0,
          rank: 4,
          grade: 'F',
          isWinner: false,
          scoreBreakdown: {
            terrainLos: 0,
            spectrumBands: 0,
            sectorAlignment: 0,
            infrastructure: 0,
          },
          servingStation: null,
          stationsCount: 0,
          si2pemStationsCount: 0,
          unverifiedStationsCount: 0,
          pros: [],
          cons: ['Brak stacji tego operatora w wykazie UKE w promieniu 7,5 km.'],
          verdict: 'Brak stacji w pobliżu — nie da się ocenić zasięgu.',
        };
      }

    // Evaluate every station of this operator in range
    interface CandidateStation {
      tower: Tower;
      distanceKm: number;
      bearingDeg: number;
      bestSectorAzimuth: number;
      sectorDeviationDeg: number;
      isMainLobe: boolean;
      isBacklobe: boolean;
      sectorKnown: boolean;
      antennaHeightM: number;
      heightKnown: boolean;
      bands: string[];
      hasCband5G: boolean;
      hasLowBand: boolean;
      hasMidBand: boolean;
      isNetworksShared: boolean;
      networksPartner?: string;
      hasSi2pem: boolean;
      pemReportDate?: string;
      pemReportNumber?: string;
    }

    const candidates: CandidateStation[] = [];

    for (const t of opTowers) {
      const dist = haversineDistanceKm(t.lat, t.lng, centerLat, centerLng);
      if (dist > searchDistKm) continue;

      const bearing = calculateBearingDeg(t.lat, t.lng, centerLat, centerLng);

      // Extract bands from tower for this operator or shared partner via NetWorkS!
      const directOpObj = t.operators.find(o => o.name === opName);
      const partnerOpObj = isNetworksOp ? t.operators.find(o => o.name === partnerOp) : null;
      const effectiveOpObj = directOpObj || partnerOpObj;
      const isNetworksShared = !directOpObj && Boolean(partnerOpObj);

      const bands = (effectiveOpObj?.bands || []).map(b => b.band);
      const freqs = bands.map(b => bandFreqMhz(b));

      const hasCband5G = freqs.some(f => f >= 3400 && f <= 3800);
      const hasLowBand = freqs.some(f => f >= 700 && f <= 950);
      const hasMidBand = freqs.some(f => f >= 1700 && f <= 2700);

      // Physical sectors: only azimuths from a real source (SI2PEM report, UKE permit, verified or submitted data).
      // When a station has none, sector alignment is left unrated instead of assuming a 0°/120°/240° layout.
      const knownAzimuths = resolveTowerAzimuths(t, pdfAzimuths).azimuths;
      const sectorKnown = knownAzimuths.length > 0;
      let bestSectorAzimuth = Math.round(bearing);
      let bestDeviation = 0;

      if (sectorKnown) {
        let minDiff = 999;
        for (const azimuth of knownAzimuths) {
          let diff = Math.abs(azimuth - bearing) % 360;
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) {
            minDiff = diff;
            bestSectorAzimuth = azimuth;
            bestDeviation = Math.round(diff * 10) / 10;
          }
        }
      }

      const isMainLobe = sectorKnown && bestDeviation <= 35;
      const isBacklobe = sectorKnown && bestDeviation > 90;
      const heightKnown = typeof t.height === 'number' && t.height > 0;
      const antennaHeightM = heightKnown ? t.height! : ASSUMED_ANTENNA_HEIGHT_M;

      const hasSi2pem = hasPemReport(t);
      const pemSummary = hasSi2pem ? (t.pemReportsByOperator?.[opName] || (isNetworksOp ? t.pemReportsByOperator?.[partnerOp] : undefined)) : undefined;

      candidates.push({
        tower: t,
        distanceKm: Math.round(dist * 100) / 100,
        bearingDeg: Math.round(bearing * 10) / 10,
        bestSectorAzimuth,
        sectorDeviationDeg: bestDeviation,
        isMainLobe,
        isBacklobe,
        sectorKnown,
        antennaHeightM,
        heightKnown,
        bands,
        hasCband5G,
        hasLowBand,
        hasMidBand,
        isNetworksShared,
        networksPartner: isNetworksShared ? partnerOp : undefined,
        hasSi2pem,
        pemReportDate: pemSummary?.checkedAt?.slice(0, 10),
      });
    }

    if (candidates.length === 0) {
      return {
        operator: opName,
        rated: false,
        score: 0,
        rank: 4,
        grade: 'F',
        isWinner: false,
        scoreBreakdown: { terrainLos: 0, spectrumBands: 0, sectorAlignment: 0, infrastructure: 0 },
        servingStation: null,
        stationsCount: 0,
        si2pemStationsCount: 0,
        unverifiedStationsCount: 0,
        pros: [],
        cons: ['Stacje tego operatora są dalej niż 7,5 km.'],
        verdict: 'Brak stacji w pobliżu — nie da się ocenić zasięgu.',
      };
    }

    // Sort candidates: prefer closer, main lobe, high-capacity stations
    candidates.sort((a, b) => {
      const penaltyA = (a.isBacklobe ? 3.5 : 0) + (a.isMainLobe ? -0.2 : 0) + (a.isNetworksShared ? 0.05 : 0);
      const penaltyB = (b.isBacklobe ? 3.5 : 0) + (b.isMainLobe ? -0.2 : 0) + (b.isNetworksShared ? 0.05 : 0);
      return (a.distanceKm + penaltyA) - (b.distanceKm + penaltyB);
    });

    const bestCandidate = candidates[0];

    // Compute LiDAR terrain profile for the primary serving station
    let losKnown = true;
    let isLosClear = false;
    let obstructionM = 0;
    let pathLossDb = 0;

    try {
      const profile = await calculateTerrainProfile({
        lat1: bestCandidate.tower.lat,
        lng1: bestCandidate.tower.lng,
        lat2: centerLat,
        lng2: centerLng,
        txHeight: bestCandidate.antennaHeightM,
        rxHeight: 5,
        freqMhz: 1800,
        // Antenna pattern loss needs a real sector direction; the tilt is not known for any station, so it is left out.
        azimuthDeg: bestCandidate.sectorKnown ? bestCandidate.bestSectorAzimuth : undefined,
        sampleCount: 15,
        includeSurface: true,
        fetcher,
      });
      isLosClear = !profile.isObstructed;
      obstructionM = profile.obstructionMaxM;
      pathLossDb = profile.pathLossDb;
    } catch {
      // No terrain data: line of sight stays unknown. Only free-space loss, which needs no terrain, is reported.
      losKnown = false;
      pathLossDb = Math.round((32.44 + 20 * Math.log10(1800) + 20 * Math.log10(Math.max(0.01, bestCandidate.distanceKm))) * 10) / 10;
    }

    // ==========================================
    // 100-Point Scoring Algorithm
    // ==========================================

    // 1. Terrain & LOS (max 30 pts)
    let terrainLosScore = 0;
    if (bestCandidate.distanceKm < 1.0) terrainLosScore += 12;
    else if (bestCandidate.distanceKm < 2.0) terrainLosScore += 10;
    else if (bestCandidate.distanceKm < 3.5) terrainLosScore += 7;
    else if (bestCandidate.distanceKm < 5.0) terrainLosScore += 4;
    else terrainLosScore += 1;

    if (!losKnown) {
      terrainLosScore += NEUTRAL.los;
    } else if (isLosClear) {
      terrainLosScore += 18;
    } else if (obstructionM <= 3.0) {
      terrainLosScore += 11;
    } else if (obstructionM <= 8.0) {
      terrainLosScore += 6;
    } else {
      terrainLosScore += 2;
    }

    // 2. Frequency Spectrum & 5G (max 30 pts)
    let spectrumScore = 0;
    if (bestCandidate.hasLowBand) spectrumScore += 8; // Essential for indoor penetration
    if (bestCandidate.hasMidBand) {
      const midCount = bestCandidate.bands.filter(b => {
        const f = bandFreqMhz(b);
        return f >= 1800 && f <= 2600;
      }).length;
      if (midCount >= 3) spectrumScore += 12; // 3CA/4CA
      else if (midCount >= 2) spectrumScore += 9;
      else spectrumScore += 5;
    }
    if (bestCandidate.hasCband5G) {
      spectrumScore += 10; // Genuine 3.6 GHz high-speed 5G
    }

    // 3. Sector Directivity & Orientation (max 20 pts)
    let sectorScore = 0;
    if (!bestCandidate.sectorKnown) {
      sectorScore = NEUTRAL.sector;
    } else if (bestCandidate.sectorDeviationDeg <= 25) {
      sectorScore = 20; // Full main beam
    } else if (bestCandidate.sectorDeviationDeg <= 45) {
      sectorScore = 16;
    } else if (bestCandidate.sectorDeviationDeg <= 70) {
      sectorScore = 11;
    } else if (bestCandidate.sectorDeviationDeg <= 90) {
      sectorScore = 6;
    } else {
      sectorScore = 2; // Backlobe penalty!
    }

    // 4. Infrastructure & SI2PEM (max 20 pts)
    let infraScore = 0;
    if (!bestCandidate.heightKnown) infraScore += NEUTRAL.height;
    else if (bestCandidate.antennaHeightM >= 45) infraScore += 8;
    else if (bestCandidate.antennaHeightM >= 35) infraScore += 6;
    else if (bestCandidate.antennaHeightM >= 25) infraScore += 4;
    else infraScore += 2;

    // Redundancy: further stations of the operator within 3 km can take over when one is busy or down.
    const nearbyCount = candidates.filter(c => c.distanceKm <= 3).length;
    if (nearbyCount >= 3) infraScore += 6;
    else if (nearbyCount >= 2) infraScore += 4;
    else infraScore += 2;

    if (bestCandidate.hasSi2pem) infraScore += 6; // Its emissions confirmed by an accredited PEM measurement

    const totalScore = Math.min(100, Math.max(0, terrainLosScore + spectrumScore + sectorScore + infraScore));

    // Dynamic Technical Pros & Cons (Strictly real RF engineering facts)
    const pros: string[] = [];
    const cons: string[] = [];

    // Distance & Proximity
    if (bestCandidate.distanceKm < 0.25) {
      pros.push(`Nadajnik w bezpośrednim sąsiedztwie (odległość zaledwie ${Math.round(bestCandidate.distanceKm * 1000)} m) – maksymalny poziom sygnału radiowego.`);
    } else if (bestCandidate.distanceKm < 0.8) {
      pros.push(`Bardzo bliska stacja bazowa (odległość ${Math.round(bestCandidate.distanceKm * 1000)} m).`);
    } else if (bestCandidate.distanceKm > 3.0) {
      cons.push(`Duża odległość do najbliższego nadajnika (${bestCandidate.distanceKm.toFixed(1)} km) – sygnał może wymagać zewnętrznej anteny.`);
    }

    // Line of sight & Fresnel zone
    if (!losKnown) {
      cons.push('Nie udało się pobrać danych wysokościowych terenu – widoczność optyczna nie została sprawdzona (ocena neutralna).');
    } else if (isLosClear) {
      pros.push(`Czysta widoczność optyczna (LOS) ze stacji ${bestCandidate.tower.stationId || bestCandidate.tower.id} – brak przeszkód w 1. strefie Fresnela.`);
    } else {
      cons.push(`Przeszkoda terenowa/LiDAR na trasie sygnału narusza 1. strefę Fresnela na głębokość ${obstructionM.toFixed(1)} m.`);
    }

    // Sector orientation & Directivity
    if (!bestCandidate.sectorKnown) {
      cons.push('Brak danych o azymutach anten tej stacji (SI2PEM / UKE) – ustawienie sektorów nie zostało ocenione (ocena neutralna).');
    } else if (bestCandidate.sectorDeviationDeg <= 20) {
      pros.push(`Wiązka główna sektora ${bestCandidate.bestSectorAzimuth}° celuje bezpośrednio w ten punkt (odchylenie tylko ${bestCandidate.sectorDeviationDeg}°).`);
    } else if (bestCandidate.sectorDeviationDeg <= 45) {
      pros.push(`Punkt wewnątrz wiązki głównej sektora ${bestCandidate.bestSectorAzimuth}° (kąt ${bestCandidate.sectorDeviationDeg}° od osi anteny).`);
    } else if (bestCandidate.isBacklobe) {
      cons.push(`Odbiór z listka wstecznego sektora ${bestCandidate.bestSectorAzimuth}° (odchylenie ${bestCandidate.sectorDeviationDeg}°) – tłumienie tyłu anteny ok. -28 dB.`);
    } else {
      cons.push(`Znaczne odchylenie kątowe (${bestCandidate.sectorDeviationDeg}°) od osi wiązki sektora ${bestCandidate.bestSectorAzimuth}°.`);
    }

    // 5G C-Band n78
    if (bestCandidate.hasCband5G) {
      pros.push('Pasmo 5G C-Band (3600 MHz, n78) w wykazie UKE – najszybsza transmisja danych z dostępnych pasm.');
    } else {
      cons.push('Brak pasma 5G C-Band (3600 MHz n78) na tej stacji – dostępne tylko pasma LTE lub 5G DSS.');
    }

    // Low bands (coverage / indoor penetration)
    if (bestCandidate.hasLowBand) {
      pros.push('Pasma zasięgowe 800/900 MHz – lepszy odbiór wewnątrz budynków.');
    } else {
      cons.push('Brak pasm zasięgowych 800/900 MHz – utrudniony odbiór w głębi budynków.');
    }

    // Capacity LTE-A aggregation
    const capBands = Array.from(new Set(bestCandidate.bands.filter(b => bandFreqMhz(b) >= 1800)));
    if (capBands.length >= 2) {
      pros.push(`Agregacja pasm pojemnościowych LTE-A (${capBands.join(', ')} MHz) zwiększająca przepustowość.`);
    } else if (capBands.length === 0) {
      cons.push('Brak pasm pojemnościowych LTE (1800/2100/2600 MHz) – tylko wolne pasmo zasięgowe.');
    }

    // Mast height
    if (!bestCandidate.heightKnown) {
      cons.push(`Wysokość zawieszenia anten nie jest znana – do obliczenia widoczności przyjęto ${ASSUMED_ANTENNA_HEIGHT_M} m n.p.t.`);
    } else if (bestCandidate.antennaHeightM >= 45) {
      pros.push(`Wysoki maszt nadawczy (${bestCandidate.antennaHeightM} m n.p.t.) górujący ponad lokalną zabudową i drzewostanem.`);
    } else if (bestCandidate.antennaHeightM < 25) {
      cons.push(`Niski maszt (${bestCandidate.antennaHeightM} m n.p.t.) narażony na tłumienie przez okoliczne obiekty.`);
    }

    // NetWorkS! (N!) sharing acknowledgement
    if (bestCandidate.isNetworksShared) {
      pros.push(`Stacja współdzielona w ramach sojuszu NetWorkS! (N!) z operatorem ${bestCandidate.networksPartner} – wspólna infrastruktura masztowo-antenowa.`);
    } else if (isNetworksOp) {
      pros.push(`Stacja bazowa w klastrze NetWorkS! (N!) ze współdzieleniem infrastruktury z ${partnerOp}.`);
    }

    // Verified SI2PEM report
    // pemReportDate is when BTMap last checked SI2PEM, not the date of the report.
    if (bestCandidate.hasSi2pem) {
      pros.push(`Stacja ma sprawozdanie z pomiarów PEM w SI2PEM${bestCandidate.pemReportDate ? ` (sprawdzono ${bestCandidate.pemReportDate})` : ''}.`);
    } else {
      cons.push('Brak sprawozdania z pomiarów PEM w SI2PEM dla tej stacji – ocena opiera się na wykazie UKE.');
    }
    if (nearbyCount >= 3) pros.push(`${nearbyCount} stacje operatora w promieniu 3 km – zapas na wypadek przeciążenia lub awarii jednej z nich.`);

    // Grade and Verdict
    let grade: OperatorEvaluation['grade'] = 'C';
    let verdict = '';

    if (totalScore >= 88) {
      grade = 'A+';
      verdict = 'Znakomity zasięg, potężna pojemność i czysty tor radiowy — idealny wybór.';
    } else if (totalScore >= 78) {
      grade = 'A';
      verdict = 'Bardzo dobre parametry sygnału i stabilne prędkości transmisji danych.';
    } else if (totalScore >= 65) {
      grade = 'B';
      verdict = 'Zadowalający zasięg podstawowy; wewnątrz budynków może wymagać agregacji.';
    } else if (totalScore >= 50) {
      grade = 'C';
      verdict = 'Przeciętne warunki; odchylony sektor lub tłumienie terenu obniżają osiągi.';
    } else {
      grade = 'D';
      verdict = 'Słaby sygnał; niezalecany jako główne łącze domowe bez anteny zewnętrznej.';
    }

    return {
      operator: opName,
      rated: true,
      isNetworks: bestCandidate.isNetworksShared || isNetworksOp,
      score: totalScore,
      rank: 1, // Will be sorted below
      grade,
      isWinner: false,
      scoreBreakdown: {
        terrainLos: terrainLosScore,
        spectrumBands: spectrumScore,
        sectorAlignment: sectorScore,
        infrastructure: infraScore,
      },
      servingStation: {
        id: bestCandidate.tower.id,
        stationId: bestCandidate.tower.stationId || bestCandidate.tower.id,
        address: bestCandidate.tower.address,
        operator: opName,
        isNetworks: bestCandidate.isNetworksShared || isNetworksOp,
        networksPartner: bestCandidate.isNetworksShared ? bestCandidate.networksPartner : partnerOp,
        distanceKm: bestCandidate.distanceKm,
        antennaHeightM: bestCandidate.antennaHeightM,
        mastType: bestCandidate.tower.mastType,
        bestSectorAzimuth: bestCandidate.bestSectorAzimuth,
        bearingDeg: bestCandidate.bearingDeg,
        sectorDeviationDeg: bestCandidate.sectorDeviationDeg,
        isMainLobe: bestCandidate.isMainLobe,
        isBacklobe: bestCandidate.isBacklobe,
        bands: bestCandidate.bands,
        hasCband5G: bestCandidate.hasCband5G,
        hasLowBand: bestCandidate.hasLowBand,
        hasMidBand: bestCandidate.hasMidBand,
        hasSi2pem: bestCandidate.hasSi2pem,
        pemReportDate: bestCandidate.pemReportDate,
        isLosClear,
        obstructionM,
        pathLossDb,
        sectorKnown: bestCandidate.sectorKnown,
        heightKnown: bestCandidate.heightKnown,
        losKnown,
      },
      stationsCount: opTowers.length,
      si2pemStationsCount: si2pemTowers.length,
      unverifiedStationsCount: withoutPemCount,
      pros,
      cons,
      verdict,
    };
  })
);

  // Sort operators by score descending
  evaluations.sort((a, b) => b.score - a.score);

  evaluations.forEach((evalObj, idx) => {
    evalObj.rank = idx + 1;
    // An operator without any confirmed station in range cannot "win" the comparison.
    evalObj.isWinner = idx === 0 && Boolean(evalObj.servingStation);
  });

  const winner = evaluations[0];
  const summaryRecommendation = !winner.servingStation
    ? 'W promieniu 7,5 km żaden z czterech operatorów nie ma stacji w wykazie UKE, więc nie da się wskazać najlepszego operatora dla tej lokalizacji.'
    : `Na podstawie stacji z wykazu UKE (pozwolenia i rejestr urządzeń), ukształtowania terenu LiDAR (NMT/NMPT), wysokości masztów, kierunków sektorów, pasm oraz pomiarów SI2PEM najlepsze warunki radiowe dla wyznaczonego obszaru (${areaKm2} km²) zapewnia ${winner.operator} (${winner.score}/100 pkt).`;

  return {
    center: [centerLat, centerLng],
    radiusM,
    areaKm2,
    targetName: req.targetName,
    evaluatedAt: new Date().toISOString(),
    bestOperator: winner.operator,
    operators: evaluations,
    summaryRecommendation,
  };
}
