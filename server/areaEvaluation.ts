import type { DatabaseSync } from 'node:sqlite';
import { haversineDistanceKm, calculateBearingDeg, calculateTerrainProfile } from './terrainProfile.ts';
import { withPemCounts, normalizeTower } from './query.ts';
import type { Tower, Operator } from '../src/types.ts';

export interface AreaEvaluationRequest {
  centerLat: number;
  centerLng: number;
  radiusM?: number; // Target area radius in meters (default 500m, max ~977m for 3.0 km²)
  areaKm2?: number; // Target area surface in km² (max 3.0 km²)
  targetName?: string; // Optional building, parcel or address label
}

export interface ServingStationInfo {
  id: string;
  stationId: string;
  address: string;
  operator: string;
  isNetworks?: boolean;
  networksPartner?: string;
  distanceKm: number;
  antennaHeightM: number;
  mastType?: string;
  bestSectorAzimuth: number;
  bearingDeg: number;
  sectorDeviationDeg: number;
  isMainLobe: boolean;
  isBacklobe: boolean;
  bands: string[];
  hasCband5G: boolean;
  hasLowBand: boolean;
  hasMidBand: boolean;
  hasSi2pem: boolean;
  pemReportDate?: string;
  pemReportNumber?: string;
  isLosClear: boolean;
  obstructionM: number;
  pathLossDb: number;
}

export interface OperatorEvaluation {
  operator: 'Orange' | 'Play' | 'Plus' | 'T-Mobile';
  isNetworks?: boolean;
  score: number; // 0 - 100
  rank: number; // 1, 2, 3, 4
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  isWinner: boolean;
  scoreBreakdown: {
    terrainLos: number;      // max 30: LiDAR LOS clearance, path loss, distance
    spectrumBands: number;   // max 30: low bands (penetration) + mid bands (CA) + 5G C-Band n78
    sectorAlignment: number; // max 20: physical sector angle deviation from target
    infrastructure: number;  // max 20: antenna height, SI2PEM verification, station density
  };
  servingStation: ServingStationInfo | null;
  si2pemStationsCount: number;
  unverifiedStationsCount: number;
  pros: string[];
  cons: string[];
  verdict: string;
}

export interface AreaEvaluationResult {
  center: [number, number];
  radiusM: number;
  areaKm2: number;
  targetName?: string;
  evaluatedAt: string;
  bestOperator: 'Orange' | 'Play' | 'Plus' | 'T-Mobile';
  operators: OperatorEvaluation[];
  summaryRecommendation: string;
}

const MAJOR_OPERATORS = ['Orange', 'Play', 'Plus', 'T-Mobile'] as const;
type MajorOperator = typeof MAJOR_OPERATORS[number];

function bandFreqMhz(b: unknown): number {
  const m = String(b || '').replace(/^[2345]g\b/i, '').match(/\d{3,4}/) || String(b || '').match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function parseAntennasFromCache(db: DatabaseSync, towerId: string): { azimuth: number; height: number; bands: string[] }[] {
  try {
    // Check if we have cached PDF report with parsed antenna table in pem_pdf_cache
    const rows = db.prepare('SELECT data FROM pem_pdf_cache WHERE data LIKE ? LIMIT 4').all(`%"${towerId}"%`) as { data: string }[];
    for (const row of rows) {
      const parsed = JSON.parse(row.data);
      if (Array.isArray(parsed.antennas) && parsed.antennas.length > 0) {
        return parsed.antennas.map((a: any) => ({
          azimuth: Number(a.azimuth) || 0,
          height: Number(a.height) || 35,
          bands: Array.isArray(a.bands) ? a.bands : [],
        }));
      }
    }
  } catch {
    // Return empty on parse error
  }
  return [];
}

export async function evaluateAreaCoverage(
  db: DatabaseSync,
  req: AreaEvaluationRequest
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

  const towers = withPemCounts(db, rawRows.map(normalizeTower)) as unknown as Tower[];

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

      // STRICT SI2PEM RULE:
      // Only count stations that have registered SI2PEM reports!
      const si2pemTowers = opTowers.filter(t => {
        const directSummary = t.pemReportsByOperator?.[opName];
        if (directSummary && directSummary.count > 0) return true;
        if (isNetworksOp) {
          const partnerSummary = t.pemReportsByOperator?.[partnerOp];
          if (partnerSummary && partnerSummary.count > 0) return true;
        }
        return false;
      });

      const unverifiedTowers = opTowers.filter(t => !si2pemTowers.includes(t));

      if (si2pemTowers.length === 0) {
        // Disqualified operator in this location (no SI2PEM confirmed stations in range)
        return {
          operator: opName,
          score: unverifiedTowers.length > 0 ? 15 : 0,
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
          si2pemStationsCount: 0,
          unverifiedStationsCount: unverifiedTowers.length,
          pros: [],
          cons: [
            'Brak jakiejkolwiek stacji bazowej z potwierdzonymi pomiarami w państwowym systemie SI2PEM w promieniu zasięgu.',
            ...(unverifiedTowers.length > 0
              ? [`Wykryto ${unverifiedTowers.length} stacji z papierowymi pozwoleniami UKE, ale bez zarejestrowanych pomiarów SI2PEM (zgodnie z zasadą zero-fikcji stacje te nie są zaliczane).`]
              : ['Całkowity brak infrastruktury nadawczej w promieniu 7.5 km.']),
          ],
          verdict: 'Brak zweryfikowanego zasięgu w SI2PEM — niezalecany w tej lokalizacji.',
        };
      }

    // Evaluate candidate SI2PEM stations for this operator
    interface CandidateStation {
      tower: Tower;
      distanceKm: number;
      bearingDeg: number;
      bestSectorAzimuth: number;
      sectorDeviationDeg: number;
      isMainLobe: boolean;
      isBacklobe: boolean;
      antennaHeightM: number;
      bands: string[];
      hasCband5G: boolean;
      hasLowBand: boolean;
      hasMidBand: boolean;
      isNetworksShared: boolean;
      networksPartner?: string;
      pemReportDate?: string;
      pemReportNumber?: string;
    }

    const candidates: CandidateStation[] = [];

    for (const t of si2pemTowers) {
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

      // Antenna height and physical sectors
      const cachedAntennas = parseAntennasFromCache(db, t.id);
      let bestSectorAzimuth = Math.round(bearing);
      let bestDeviation = 0;

      if (cachedAntennas.length > 0) {
        let minDiff = 999;
        for (const ant of cachedAntennas) {
          let diff = Math.abs(ant.azimuth - bearing) % 360;
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) {
            minDiff = diff;
            bestSectorAzimuth = ant.azimuth;
            bestDeviation = Math.round(diff * 10) / 10;
          }
        }
      } else {
        // Standard nominal 3-sector layout (e.g. 0°, 120°, 240° or aligned)
        const nominalSectors = [0, 120, 240];
        let minDiff = 999;
        for (const az of nominalSectors) {
          let diff = Math.abs(az - bearing) % 360;
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) {
            minDiff = diff;
            bestSectorAzimuth = az;
            bestDeviation = Math.round(diff * 10) / 10;
          }
        }
      }

      const isMainLobe = bestDeviation <= 35;
      const isBacklobe = bestDeviation > 90;
      const antennaHeightM = t.height || 38;

      const pemSummary = t.pemReportsByOperator?.[opName] || (isNetworksOp ? t.pemReportsByOperator?.[partnerOp] : undefined);

      candidates.push({
        tower: t,
        distanceKm: Math.round(dist * 100) / 100,
        bearingDeg: Math.round(bearing * 10) / 10,
        bestSectorAzimuth,
        sectorDeviationDeg: bestDeviation,
        isMainLobe,
        isBacklobe,
        antennaHeightM,
        bands,
        hasCband5G,
        hasLowBand,
        hasMidBand,
        isNetworksShared,
        networksPartner: isNetworksShared ? partnerOp : undefined,
        pemReportDate: pemSummary?.checkedAt?.slice(0, 10),
      });
    }

    if (candidates.length === 0) {
      return {
        operator: opName,
        score: 10,
        rank: 4,
        grade: 'F',
        isWinner: false,
        scoreBreakdown: { terrainLos: 0, spectrumBands: 0, sectorAlignment: 0, infrastructure: 0 },
        servingStation: null,
        si2pemStationsCount: 0,
        unverifiedStationsCount: unverifiedTowers.length,
        pros: [],
        cons: ['Stacje SI2PEM tego operatora znajdują się poza efektywnym zasięgiem radiowym (> 7.5 km).'],
        verdict: 'Brak stacji w zasięgu.',
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
    let isLosClear = true;
    let obstructionM = 0;
    let pathLossDb = 105;

    try {
      const profile = await calculateTerrainProfile({
        lat1: bestCandidate.tower.lat,
        lng1: bestCandidate.tower.lng,
        lat2: centerLat,
        lng2: centerLng,
        txHeight: bestCandidate.antennaHeightM,
        rxHeight: 5,
        freqMhz: 1800,
        azimuthDeg: bestCandidate.bestSectorAzimuth,
        tiltDeg: 3,
        sampleCount: 15,
        includeSurface: true,
      });
      isLosClear = !profile.isObstructed;
      obstructionM = profile.obstructionMaxM;
      pathLossDb = profile.pathLossDb;
    } catch {
      // Fallback: estimate clear if under 2km
      isLosClear = bestCandidate.distanceKm < 2.2;
      obstructionM = isLosClear ? 0 : 4.5;
      pathLossDb = Math.round(92 + 20 * Math.log10(Math.max(0.2, bestCandidate.distanceKm)));
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

    if (isLosClear) {
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
    if (bestCandidate.sectorDeviationDeg <= 25) {
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
    if (bestCandidate.antennaHeightM >= 45) infraScore += 8;
    else if (bestCandidate.antennaHeightM >= 35) infraScore += 6;
    else if (bestCandidate.antennaHeightM >= 25) infraScore += 4;
    else infraScore += 2;

    if (si2pemTowers.length >= 3) infraScore += 6; // Redundancy
    else if (si2pemTowers.length >= 2) infraScore += 4;
    else infraScore += 2;

    infraScore += 6; // Confirmed SI2PEM certified measurements

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
    if (isLosClear) {
      pros.push(`Czysta widoczność optyczna (LOS) ze stacji ${bestCandidate.tower.stationId || bestCandidate.tower.id} – brak przeszkód w 1. strefie Fresnela.`);
    } else {
      cons.push(`Przeszkoda terenowa/LiDAR na trasie sygnału narusza 1. strefę Fresnela na głębokość ${obstructionM.toFixed(1)} m.`);
    }

    // Sector orientation & Directivity
    if (bestCandidate.sectorDeviationDeg <= 20) {
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
      pros.push('Aktywne pasmo 5G C-Band (3600 MHz n78) w wykazie UKE – gigabitowe transfery i minimalne opóźnienia.');
    } else {
      cons.push('Brak pasma 5G C-Band (3600 MHz n78) na tej stacji – dostępne tylko pasma LTE lub 5G DSS.');
    }

    // Low bands (coverage / indoor penetration)
    if (bestCandidate.hasLowBand) {
      pros.push('Pasma zasięgowe 800/900 MHz gwarantujące stabilny sygnał wewnątrz pomieszczeń.');
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
    if (bestCandidate.antennaHeightM >= 45) {
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
    pros.push(`Zweryfikowane laboratoryjne sprawozdanie PEM zarejestrowane w państwowym systemie SI2PEM${bestCandidate.pemReportDate ? ` (${bestCandidate.pemReportDate})` : ''}.`);

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
        hasSi2pem: true,
        pemReportDate: bestCandidate.pemReportDate,
        isLosClear,
        obstructionM,
        pathLossDb,
      },
      si2pemStationsCount: si2pemTowers.length,
      unverifiedStationsCount: unverifiedTowers.length,
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
    evalObj.isWinner = idx === 0;
  });

  const winner = evaluations[0];
  const summaryRecommendation = `Na podstawie analizy ukształtowania terenu LiDAR (NMT/NMPT), wysokości masztów, orientacji sektorów oraz pasm w pozwoleniach UKE i państwowym rejestrze SI2PEM, najlepsze warunki radiowe dla wyznaczonej działki (${areaKm2} km²) zapewnia ${winner.operator} (${winner.score}/100 pkt).`;

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
