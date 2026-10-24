export interface TerrainProfilePoint {
  distanceKm: number;
  lat: number;
  lng: number;
  elevation: number;
  clutter: number;
  curvDrop: number;
  totalGround: number;
  rayHeight: number;
  fresnelRadius: number;
  isObstacle: boolean;
}

export interface TerrainProfileResult {
  distanceKm: number;
  azimuthDeg: number;
  elevationAngleDeg: number;
  txElevation: number;
  rxElevation: number;
  txHeight: number;
  rxHeight: number;
  txTotalAlt: number;
  rxTotalAlt: number;
  points: TerrainProfilePoint[];
  minElevation: number;
  maxElevation: number;
  isObstructed: boolean;
  obstructionMaxM: number;
  obstructionDistKm: number;
  isTerrainObstructed: boolean;
  isClutterObstructed: boolean;
  pathLossDb: number;
  fieldStrengthDbUvM: number;
  verticalDeviationDeg: number | null;
  horizontalDeviationDeg: number | null;
  antennaLossDb?: number;
  isBacklobe?: boolean;
  source: string;
  nmptAvailable: boolean;
  stepM: number;
}

const R_EFF = 8495000; // 4/3 * 6371 km in meters (ITU-R standard effective Earth radius)

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateBearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const y = Math.sin((lng2 - lng1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lng2 - lng1) * (Math.PI / 180));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/**
 * Converts WGS84 (lat, lng) to Polish PUWG 1992 (EPSG:2180) coordinates.
 * Returns { x: Northing, y: Easting } in meters.
 */
export function wgs84ToPuwg1992(lat: number, lng: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const m0 = 0.9993;
  const L0 = (19.0 * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const l = lam - L0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const t = tanPhi * tanPhi;
  const eta2 = ep2 * cosPhi * cosPhi;
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);

  const A0 = 1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256;
  const A2 = (3 / 8) * (e2 + (e2 * e2) / 4 + (15 * e2 ** 3) / 128);
  const A4 = (15 / 256) * (e2 * e2 + (3 * e2 ** 3) / 4);
  const A6 = (35 * e2 ** 3) / 3072;
  const M = a * (A0 * phi - A2 * Math.sin(2 * phi) + A4 * Math.sin(4 * phi) - A6 * Math.sin(6 * phi));

  const xGK =
    M +
    N *
      sinPhi *
      cosPhi *
      ((l * l) / 2 +
        ((l ** 4) / 24) * cosPhi * cosPhi * (5 - t + 9 * eta2 + 4 * eta2 * eta2) +
        ((l ** 6) / 720) * cosPhi ** 4 * (61 - 58 * t + t * t));

  const yGK =
    N *
    cosPhi *
    (l +
      ((l ** 3) / 6) * cosPhi * cosPhi * (1 - t + eta2) +
      ((l ** 5) / 120) * cosPhi ** 4 * (5 - 18 * t + t * t + 14 * eta2 - 58 * eta2 * t));

  const x = m0 * xGK - 5300000;
  const y = m0 * yGK + 500000;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

/** In-memory cache for terrain bare-earth elevations (NMT) */
const elevationCache = new Map<string, { elevations: number[]; source: string }>();

/** In-memory cache and in-flight deduplication for GUGiK NMPT surface clutter */
const nmptCache = new Map<string, number[]>();
const nmptInFlight = new Map<string, Promise<number[] | null>>();

function buildRouteCacheKey(points: { lat: number; lng: number }[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${first.lat.toFixed(5)},${first.lng.toFixed(5)}->${last.lat.toFixed(5)},${last.lng.toFixed(5)}#${points.length}`;
}

/** Fetches bare-earth elevations (NMT) using official GUGiK LiDAR (GetHByPointList) or Open-Meteo fallback */
export async function fetchLidarElevations(
  points: { lat: number; lng: number }[],
  fetcher: typeof fetch = fetch
): Promise<{ elevations: number[]; source: string }> {
  const cacheKey = buildRouteCacheKey(points);
  if (elevationCache.has(cacheKey)) {
    return elevationCache.get(cacheKey)!;
  }

  // 1. Official GUGiK NMT LiDAR API for coordinates in Poland
  const inPoland = points.every(p => p.lat >= 49 && p.lat <= 55 && p.lng >= 14 && p.lng <= 24.5);
  if (inPoland && points.length <= 250) {
    try {
      const puwgList = points.map(p => {
        const c = wgs84ToPuwg1992(p.lat, p.lng);
        return `${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
      });
      const url = `https://services.gugik.gov.pl/nmt/?request=GetHByPointList&list=${encodeURIComponent(
        puwgList.join(',')
      )}`;
      const res = await fetcher(url, { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const text = await res.text();
        const parts = text.split(',').filter(Boolean);
        if (parts.length === points.length) {
          const elevations = parts.map(part => {
            const tokens = part.trim().split(/\s+/);
            const val = parseFloat(tokens[tokens.length - 1]?.replace(',', '.') || '0');
            return Number.isFinite(val) ? val : 100;
          });
          const result = { elevations, source: 'GUGiK NMT (LiDAR 1 m)' };
          if (elevationCache.size > 250) elevationCache.delete(elevationCache.keys().next().value!);
          elevationCache.set(cacheKey, result);
          return result;
        }
      }
    } catch {
      /* fallback to Open-Meteo */
    }
  }

  // 2. Open-Meteo Copernicus DEM fallback
  try {
    const lats = points.map(p => p.lat.toFixed(6)).join(',');
    const lngs = points.map(p => p.lng.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(9000) });
    if (res.ok) {
      const data = (await res.json()) as { elevation?: number[] };
      if (Array.isArray(data.elevation) && data.elevation.length === points.length) {
        const result = { elevations: data.elevation, source: 'Copernicus DEM (90 m)' };
        if (elevationCache.size > 250) elevationCache.delete(elevationCache.keys().next().value!);
        elevationCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {
    /* fallback to flat reference if offline */
  }

  const elevations = points.map(() => 115);
  return { elevations, source: 'Brak połączenia z GUGiK NMT' };
}

/**
 * Fetches real Digital Surface Model (NMPT - trees, forests, buildings) from GUGiK WCS
 * (mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel)
 * and computes real clutter height = max(0, NMPT - NMT) at each sample point.
 */
export async function fetchGugikNmptClutter(
  points: { lat: number; lng: number; distKm: number }[],
  nmtElevations: number[],
  fetcher: typeof fetch = fetch
): Promise<number[] | null> {
  const inPoland = points.every(p => p.lat >= 49 && p.lat <= 55 && p.lng >= 14 && p.lng <= 24.5);
  if (!inPoland || points.length < 2) return null;

  const cacheKey = buildRouteCacheKey(points);
  if (nmptCache.has(cacheKey)) {
    return nmptCache.get(cacheKey)!;
  }
  if (nmptInFlight.has(cacheKey)) {
    return nmptInFlight.get(cacheKey)!;
  }

  const job = (async (): Promise<number[] | null> => {
    try {
      const puwgPts = points.map(p => wgs84ToPuwg1992(p.lat, p.lng));
      const totalPoints = points.length;

      // Divide the route into compact ~450m segments to prevent MapServer WCS from mosaicing across 1km map sheets
      const SEGMENT_METERS = 450;
      const segments: { startIdx: number; endIdx: number }[] = [];
      let segStart = 0;
      for (let i = 1; i < totalPoints; i++) {
        const dStart = points[segStart].distKm * 1000;
        const dCur = points[i].distKm * 1000;
        if (dCur - dStart >= SEGMENT_METERS || i === totalPoints - 1) {
          segments.push({ startIdx: segStart, endIdx: i });
          segStart = i;
        }
      }

      const clutters = new Float32Array(totalPoints);
      let anySegmentLoaded = false;

      // Query all segments in parallel using modern DSM_PL-EVRF2007-NH coverage
      await Promise.all(
        segments.map(async seg => {
          const segPts = puwgPts.slice(seg.startIdx, seg.endIdx + 1);
          const eastings = segPts.map(p => p.y);
          const northings = segPts.map(p => p.x);

          const minE = Math.floor(Math.min(...eastings) - 20);
          const maxE = Math.ceil(Math.max(...eastings) + 20);
          const minN = Math.floor(Math.min(...northings) - 20);
          const maxN = Math.ceil(Math.max(...northings) + 20);

          const spanE = maxE - minE;
          const spanN = maxN - minN;

          // 4m cell step delivers sharp canopy and roof detection while keeping grid size compact (< 160x160)
          const cellStep = 4;
          const width = Math.max(8, Math.min(160, Math.round(spanE / cellStep)));
          const height = Math.max(8, Math.min(160, Math.round(spanN / cellStep)));

          const wcsUrl =
            `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel` +
            `?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=DSM_PL-EVRF2007-NH` +
            `&CRS=EPSG:2180&BBOX=${minE},${minN},${maxE},${maxN}` +
            `&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/x-aaigrid`;

          try {
            const res = await fetcher(wcsUrl, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) return;

            const text = await res.text();
            if (!text.includes('ncols') || !text.includes('nrows')) return;

            const lines = text.trim().split(/\r?\n/);
            const header: Record<string, number> = {};
            let dataStartIdx = 0;

            for (let i = 0; i < Math.min(12, lines.length); i++) {
              const m = lines[i].trim().match(/^([a-zA-Z_]+)\s+(-?\d+(?:\.\d+)?)$/);
              if (m) {
                header[m[1].toLowerCase()] = parseFloat(m[2]);
                dataStartIdx = i + 1;
              } else {
                break;
              }
            }

            const ncols = Math.round(header.ncols || 0);
            const nrows = Math.round(header.nrows || 0);
            const xll = header.xllcorner ?? minE;
            const yll = header.yllcorner ?? minN;
            const dx = header.dx ?? header.cellsize ?? spanE / ncols;
            const dy = header.dy ?? header.cellsize ?? spanN / nrows;
            const nodata = header.nodata_value ?? -9999;

            if (ncols <= 0 || nrows <= 0) return;

            const tokens = lines.slice(dataStartIdx).join(' ').trim().split(/\s+/);
            if (tokens.length < ncols * nrows) return;

            const grid = new Float32Array(ncols * nrows);
            for (let i = 0; i < ncols * nrows; i++) {
              grid[i] = parseFloat(tokens[i]);
            }

            for (let i = seg.startIdx; i <= seg.endIdx; i++) {
              const dKm = points[i].distKm;
              // Exclude transmitter tower footprint (< 30m) and exact receiver point from external clutter
              if (i === 0 || i === totalPoints - 1 || dKm < 0.03) {
                clutters[i] = 0;
                continue;
              }

              const e = puwgPts[i].y;
              const n = puwgPts[i].x;
              const colF = (e - xll) / dx - 0.5;
              const rowF = nrows - 1 - ((n - yll) / dy - 0.5);

              const c0 = Math.max(0, Math.min(ncols - 1, Math.round(colF)));
              const r0 = Math.max(0, Math.min(nrows - 1, Math.round(rowF)));

              // Sample the cell and immediate 4-orthogonal neighbors to capture narrow tree crowns / roof ridges along the ray
              let bestSurface = -Infinity;
              const offsets = [
                [0, 0],
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
              ];
              for (const [dr, dc] of offsets) {
                const rr = Math.max(0, Math.min(nrows - 1, r0 + dr));
                const cc = Math.max(0, Math.min(ncols - 1, c0 + dc));
                const val = grid[rr * ncols + cc];
                if (Number.isFinite(val) && Math.abs(val - nodata) > 1 && val > -50 && val < 3500) {
                  if (val > bestSurface) bestSurface = val;
                }
              }

              const baseElev = nmtElevations[i] ?? 100;
              if (bestSurface > -Infinity) {
                const diff = bestSurface - baseElev;
                // Clutter must exceed 0.6m threshold to filter out LiDAR noise / datum variation
                const cleanClutter = diff > 0.6 ? Math.min(85, Math.round(diff * 10) / 10) : 0;
                clutters[i] = cleanClutter;
              } else {
                clutters[i] = 0;
              }
            }

            anySegmentLoaded = true;
          } catch {
            /* segment timeout or error */
          }
        })
      );

      if (!anySegmentLoaded) return null;

      const result = Array.from(clutters);
      if (nmptCache.size > 200) nmptCache.delete(nmptCache.keys().next().value!);
      nmptCache.set(cacheKey, result);
      return result;
    } catch {
      return null;
    } finally {
      nmptInFlight.delete(cacheKey);
    }
  })();

  nmptInFlight.set(cacheKey, job);
  return job;
}

export async function calculateTerrainProfile(options: {
  lat1: number;
  lng1: number;
  lat2: number;
  lng2: number;
  txHeight?: number;
  rxHeight?: number;
  freqMhz?: number;
  azimuthDeg?: number;
  tiltDeg?: number;
  sampleCount?: number;
  includeSurface?: boolean;
  fetcher?: typeof fetch;
}): Promise<TerrainProfileResult> {
  const {
    lat1,
    lng1,
    lat2,
    lng2,
    txHeight = 35,
    rxHeight = 5,
    freqMhz = 1800,
    azimuthDeg: antAzimuth,
    tiltDeg: antTilt,
    includeSurface = true,
    fetcher = fetch,
  } = options;

  const totalDistKm = Math.max(0.01, haversineDistanceKm(lat1, lng1, lat2, lng2));
  const bearingDeg = calculateBearingDeg(lat1, lng1, lat2, lng2);
  const totalDistM = totalDistKm * 1000;

  // Sample every ~15 meters (capped between 30 and 100 points for optimal GUGiK performance)
  const targetStepM = 15;
  const rawCount = Math.round(totalDistM / targetStepM) + 1;
  const samples = options.sampleCount ?? Math.max(30, Math.min(100, rawCount));
  const actualStepM = totalDistM / (samples - 1);

  const coords: { lat: number; lng: number; distKm: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    coords.push({
      lat: lat1 + t * (lat2 - lat1),
      lng: lng1 + t * (lng2 - lng1),
      distKm: t * totalDistKm,
    });
  }

  const routeKey = buildRouteCacheKey(coords);
  const { elevations: rawElevations, source: nmtSource } = await fetchLidarElevations(coords, fetcher);

  // Use cached NMPT immediately if available, or fetch from GUGiK WCS when includeSurface is enabled
  let nmptClutters: number[] | null = nmptCache.get(routeKey) ?? null;
  if (!nmptClutters && includeSurface) {
    nmptClutters = await fetchGugikNmptClutter(coords, rawElevations, fetcher);
  }

  const nmptAvailable = Array.isArray(nmptClutters) && nmptClutters.length === samples;
  const source = nmptAvailable ? 'GUGiK LiDAR (NMT + NMPT 1 m)' : nmtSource;

  const txElevation = rawElevations[0] ?? 100;
  const rxElevation = rawElevations[rawElevations.length - 1] ?? 100;
  const txTotalAlt = txElevation + txHeight;
  const rxTotalAlt = rxElevation + rxHeight;

  const lambdaM = 300 / Math.max(400, freqMhz); // wavelength in meters

  let maxObstructionM = 0;
  let maxObstructionDistKm = 0;
  let hasTerrainObstruction = false;
  let hasClutterObstruction = false;

  const points: TerrainProfilePoint[] = [];

  for (let i = 0; i < samples; i++) {
    const dKm = coords[i].distKm;
    const dM = dKm * 1000;
    const dFromRxM = totalDistM - dM;
    const t = totalDistKm > 0 ? dKm / totalDistKm : 0;

    const elev = rawElevations[i] ?? 100;
    // Strictly real LiDAR NMPT clutter only (0 when bare earth or not yet loaded)
    const clutter = nmptAvailable ? (nmptClutters![i] ?? 0) : 0;

    // Earth curvature bulge relative to LOS chord
    const curvDrop = (dM * dFromRxM) / (2 * R_EFF);
    const totalGround = elev + clutter + curvDrop;
    const groundAlone = elev + curvDrop;

    // Direct Line-of-sight ray altitude
    const rayHeight = txTotalAlt + t * (rxTotalAlt - txTotalAlt);

    // 1st Fresnel zone radius
    const fresnelRadius =
      dM > 0 && dFromRxM > 0 && totalDistM > 0
        ? Math.sqrt((lambdaM * dM * dFromRxM) / totalDistM)
        : 0;

    // For terminal clutter (near receiver or near tower) or micro-cells under 200m,
    // overhead tree canopy at terminal is local terminal clutter, not path blockage.
    const isTerminalZone = dFromRxM < 30 || dM < 30 || totalDistM < 200;
    const effectiveGround = isTerminalZone ? groundAlone : totalGround;
    const isObstacle = effectiveGround > rayHeight;
    const obstructionDepth = Math.max(0, effectiveGround - rayHeight);

    if (isObstacle && obstructionDepth > maxObstructionM) {
      maxObstructionM = obstructionDepth;
      maxObstructionDistKm = dKm;
    }
    if (groundAlone > rayHeight) {
      hasTerrainObstruction = true;
    }
    if (totalGround > rayHeight && !isTerminalZone) {
      hasClutterObstruction = true;
    }

    points.push({
      distanceKm: Math.round(dKm * 100) / 100,
      lat: coords[i].lat,
      lng: coords[i].lng,
      elevation: Math.round(elev * 10) / 10,
      clutter: Math.round(clutter * 10) / 10,
      curvDrop: Math.round(curvDrop * 10) / 10,
      totalGround: Math.round(totalGround * 10) / 10,
      rayHeight: Math.round(rayHeight * 10) / 10,
      fresnelRadius: Math.round(fresnelRadius * 10) / 10,
      isObstacle,
    });
  }

  const isObstructed = maxObstructionM > 0;

  // Free Space Path Loss (FSPL)
  const fspl = 32.44 + 20 * Math.log10(freqMhz) + 20 * Math.log10(totalDistKm);

  // Knife-edge diffraction excess loss if obstructed
  let diffractionLoss = 0;
  if (isObstructed && maxObstructionM > 0 && maxObstructionDistKm > 0) {
    const d1M = Math.max(10, maxObstructionDistKm * 1000);
    const d2M = Math.max(10, totalDistM - d1M);
    const v = maxObstructionM * Math.sqrt((2 / lambdaM) * (1 / d1M + 1 / d2M));
    if (v > -0.7) {
      diffractionLoss = 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
    }
  }

  // Vertical elevation angle of receiver as seen from transmitter
  const elevationAngleDeg =
    Math.atan2(rxTotalAlt - txTotalAlt - (totalDistM ** 2) / (2 * R_EFF), totalDistM) * (180 / Math.PI);

  const verticalDeviationDeg =
    antTilt !== undefined && Number.isFinite(antTilt)
      ? Math.round(Math.abs(-antTilt - elevationAngleDeg) * 10) / 10
      : null;

  // 3GPP TR 38.901 / ITU-R Sector Antenna Radiation Pattern Loss
  let horizontalPatternLossDb = 0;
  let horizontalDeviationDeg: number | null = null;
  let isBacklobe = false;

  if (antAzimuth !== undefined && Number.isFinite(antAzimuth)) {
    let diff = Math.abs(bearingDeg - antAzimuth) % 360;
    if (diff > 180) diff = 360 - diff;
    horizontalDeviationDeg = Math.round(diff * 10) / 10;

    // Standard 65° horizontal 3dB beamwidth, 28 dB front-to-back ratio
    const theta3dB = 65;
    const maxFbrDb = 28;
    horizontalPatternLossDb = Math.min(maxFbrDb, 12 * ((diff / theta3dB) ** 2));
    if (diff > 90) {
      isBacklobe = true;
    }
  }

  // Vertical Antenna Pattern Loss (downtilt deviation)
  let verticalPatternLossDb = 0;
  if (verticalDeviationDeg !== null) {
    const phi3dB = 7.0; // standard vertical 3dB beamwidth
    const maxSlaDb = 20; // side-lobe attenuation
    verticalPatternLossDb = Math.min(maxSlaDb, 12 * ((verticalDeviationDeg / phi3dB) ** 2));
  }

  const antennaLossDb = Math.round(Math.min(30, horizontalPatternLossDb + verticalPatternLossDb) * 10) / 10;

  // Path loss includes FSPL + knife-edge obstacle diffraction + antenna sector pattern attenuation
  const pathLossDb = Math.round((fspl + Math.max(0, diffractionLoss) + antennaLossDb) * 10) / 10;

  // Reference electric field strength in dBµV/m (1 kW ERP, reduced by diffraction and off-axis antenna pattern)
  const fieldStrengthDbUvM = Math.max(
    0,
    Math.round((106.9 - 20 * Math.log10(totalDistKm) - Math.max(0, diffractionLoss) - antennaLossDb) * 10) / 10
  );

  const allElevations = points.map(p => p.totalGround).concat([txTotalAlt, rxTotalAlt]);
  const minElevation = Math.floor(Math.min(...points.map(p => p.elevation)));
  const maxElevation = Math.ceil(Math.max(...allElevations));

  return {
    distanceKm: Math.round(totalDistKm * 100) / 100,
    azimuthDeg: Math.round(bearingDeg * 10) / 10,
    elevationAngleDeg: Math.round(elevationAngleDeg * 10) / 10,
    txElevation: Math.round(txElevation * 10) / 10,
    rxElevation: Math.round(rxElevation * 10) / 10,
    txHeight,
    rxHeight,
    txTotalAlt: Math.round(txTotalAlt * 10) / 10,
    rxTotalAlt: Math.round(rxTotalAlt * 10) / 10,
    points,
    minElevation,
    maxElevation,
    isObstructed,
    obstructionMaxM: Math.round(maxObstructionM * 10) / 10,
    obstructionDistKm: Math.round(maxObstructionDistKm * 100) / 100,
    isTerrainObstructed: hasTerrainObstruction,
    isClutterObstructed: hasClutterObstruction && !hasTerrainObstruction,
    pathLossDb,
    fieldStrengthDbUvM,
    verticalDeviationDeg,
    horizontalDeviationDeg,
    antennaLossDb,
    isBacklobe,
    source,
    nmptAvailable,
    stepM: Math.round(actualStepM),
  };
}
