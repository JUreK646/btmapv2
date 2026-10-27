/**
 * Precision Cellular Network Identifier Parser & Calculator for BTMap v2
 * Supports NetMonster, Netmode, Samsung ServiceMode (*#0011#), FieldTest, CellMapper
 */

export interface ParsedCellId {
  isCellIdQuery: boolean;
  type: 'LTE' | 'NR' | 'UMTS' | 'GSM' | 'GENERIC';
  nodeId?: number;              // eNodeB or gNodeB
  nodeIdStr?: string;           // string representation e.g. "24102"
  sectorNum?: number;           // physical antenna sector: 1, 2, 3...
  cellId?: number;              // local cell ID (LCID) 0..255
  eci?: number;                 // E-UTRAN Cell Identifier (eNB * 256 + cellId)
  nci?: number;                 // 5G NR Cell Identity
  pci?: number;                 // Physical Cell ID (0..503 in LTE, 0..1007 in NR)
  tac?: number;                 // Tracking Area Code
  rnc?: number;                 // 3G Radio Network Controller
  displaySummary: string;       // Polish user-friendly summary e.g. "eNodeB 24102 · Sektor 1 (CID 1)"
  stationIdCandidate?: string;  // e.g. "24102"
}

/**
 * Derives the physical antenna sector index (1, 2, 3...) from cell identity.
 * In Polish mobile networks (Orange, Play, Plus, T-Mobile):
 * - Sector 1 carriers: 1, 11, 21, 31, 41, 51...
 * - Sector 2 carriers: 2, 12, 22, 32, 42, 52...
 * - Sector 3 carriers: 3, 13, 23, 33, 43, 53...
 */
export function deriveSectorNumber(cellId: number | null | undefined): number | null {
  if (cellId === null || cellId === undefined || !Number.isFinite(cellId)) return null;
  if (cellId <= 0) return 1;
  if (cellId >= 1 && cellId <= 9) return cellId;
  const lastDigit = cellId % 10;
  if (lastDigit >= 1 && lastDigit <= 6) {
    return lastDigit;
  }
  return ((cellId - 1) % 3) + 1;
}

/**
 * Parses a search string to detect cellular base station identifiers.
 */
export function parseCellSearch(input: string | null | undefined): ParsedCellId | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length < 2) return null;

  // 1. Check for explicit keywords: eNB, eNodeB, gNB, gNodeB, ECI, NCI, CID, LCID, RNC, TAC, PCI
  const enbMatch = raw.match(/(?:\b|_)(?:enb|enodeb)(?:\b|_|\s*[:=]?\s*)(\d{1,8})/i);
  const gnbMatch = raw.match(/(?:\b|_)(?:gnb|gnodeb)(?:\b|_|\s*[:=]?\s*)(\d{1,10})/i);
  const cellIdFallback = !enbMatch ? raw.match(/(?:\b|_)(?:cell\s*id|ci)(?:\b|_|\s*[:=]?\s*)(\d{6,10})/i) : null;
  const eciMatch = raw.match(/(?:\b|_)(?:eci|global\s*cell\s*id|cgi)(?:\b|_|\s*[:=]?\s*)(\d{6,10})/i) || cellIdFallback;
  const nciMatch = raw.match(/(?:\b|_)(?:nci)(?:\b|_|\s*[:=]?\s*)(\d{6,12})/i);

  // Local Cell ID / Sector (1..999)
  const cidMatch = raw.match(/(?:\b|_)(?:cid|lcid|cell\s*id|sector|sektor)(?:\b|_|\s*[:=]?\s*)(\d{1,4})/i)
                || raw.match(/(?:enb|gnb)\s*[:=]?\s*\d+\s*[,;\/-]\s*(?:cid\s*[:=]?\s*)?(\d{1,3})/i);

  const pciMatch = raw.match(/(?:\b|_)(?:pci)(?:\b|_|\s*[:=]?\s*)(\d{1,4})/i);
  const tacMatch = raw.match(/(?:\b|_)(?:tac|lac)(?:\b|_|\s*[:=]?\s*)(\d{1,6})/i);
  const rncMatch = raw.match(/(?:\b|_)(?:rnc)(?:\b|_|\s*[:=]?\s*)(\d{1,5})/i);

  // Common pattern like "24102-1" or "24102/1" or "24102:1" or "26002-24102-1"
  const dashPattern = raw.match(/^(?:260\d{2}[-\s])?(\d{3,6})[-\/:_](\d{1,3})$/);

  // Standalone large 7-8 digit number -> probable ECI
  const plainEciMatch = !enbMatch && !gnbMatch && !eciMatch && raw.match(/^(\d{7,9})$/);

  let type: 'LTE' | 'NR' | 'UMTS' | 'GSM' | 'GENERIC' = 'GENERIC';
  let nodeId: number | null = null;
  let cellId: number | null = null;
  let sectorNum: number | null = null;
  let eci: number | null = null;
  let nci: number | null = null;

  const matchedEci = eciMatch || plainEciMatch;
  if (matchedEci) {
    const rawVal = Number(matchedEci[1]);
    if (rawVal >= 256 && rawVal < 268435456) { // 28-bit LTE ECI limit
      type = 'LTE';
      eci = rawVal;
      nodeId = Math.floor(rawVal / 256);
      cellId = rawVal % 256;
      sectorNum = deriveSectorNumber(cellId);
    }
  } else if (nciMatch) {
    const rawVal = Number(nciMatch[1]);
    type = 'NR';
    nci = rawVal;
    nodeId = Math.floor(rawVal / 4096);
    cellId = rawVal % 4096;
    sectorNum = deriveSectorNumber(cellId);
  } else if (enbMatch) {
    type = 'LTE';
    nodeId = Number(enbMatch[1]);
  } else if (gnbMatch) {
    type = 'NR';
    nodeId = Number(gnbMatch[1]);
  } else if (dashPattern) {
    type = 'LTE';
    nodeId = Number(dashPattern[1]);
    cellId = Number(dashPattern[2]);
    sectorNum = deriveSectorNumber(cellId);
  }

  if (cidMatch && cellId === null) {
    cellId = Number(cidMatch[1]);
    sectorNum = deriveSectorNumber(cellId);
  }

  if (nodeId !== null && cellId !== null && eci === null && type === 'LTE') {
    eci = nodeId * 256 + cellId;
  }

  const pci = pciMatch ? Number(pciMatch[1]) : undefined;
  const tac = tacMatch ? Number(tacMatch[1]) : undefined;
  const rnc = rncMatch ? Number(rncMatch[1]) : undefined;

  if (nodeId === null && eci === null && cellId === null) {
    return null;
  }

  const nodeIdStr = nodeId !== null ? String(nodeId) : undefined;
  let displaySummary = '';
  if (type === 'LTE' && nodeIdStr) {
    displaySummary = `eNodeB ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId} (CID ${cellId})`;
    if (eci !== null) displaySummary += ` · ECI ${eci}`;
  } else if (type === 'NR' && nodeIdStr) {
    displaySummary = `gNodeB ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId}`;
    if (nci !== null) displaySummary += ` · NCI ${nci}`;
  } else if (nodeIdStr) {
    displaySummary = `Stacja ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId}`;
  }

  return {
    isCellIdQuery: true,
    type,
    nodeId: nodeId ?? undefined,
    nodeIdStr,
    sectorNum: sectorNum ?? undefined,
    cellId: cellId ?? undefined,
    eci: eci ?? undefined,
    nci: nci ?? undefined,
    pci,
    tac,
    rnc,
    displaySummary,
    stationIdCandidate: nodeIdStr,
  };
}

/**
 * Resolves the antenna sector azimuth for a station given a sector number (1, 2, 3...)
 */
export function resolveSectorAzimuth(
  azimuths: number[] | null | undefined,
  sectorNum: number | null | undefined
): { azimuth: number; sectorNum: number } | null {
  if (!Array.isArray(azimuths) || azimuths.length === 0) return null;
  if (!sectorNum || sectorNum < 1) return null;
  const idx = (sectorNum - 1) % azimuths.length;
  return {
    azimuth: azimuths[idx],
    sectorNum,
  };
}

export interface SectorCellInfo {
  sectorNum: number;
  azimuth?: number;
  cid: number;
  eci: number;
}

export function extractEnodeBId(stationId: string | null | undefined): number | null {
  if (!stationId) return null;
  const m = stationId.match(/(?:BT)?(\d{4,6})\b/i) || stationId.match(/\d{4,6}/);
  if (m) {
    const num = Number(m[1] || m[0]);
    if (num > 0 && num < 10000000) return num;
  }
  return null;
}

export function getStationSectorsInfo(
  stationId: string | null | undefined,
  azimuths?: number[]
): SectorCellInfo[] {
  const enb = extractEnodeBId(stationId);
  if (!enb) return [];
  const azList = Array.isArray(azimuths) && azimuths.length > 0 ? azimuths : [0, 120, 240];
  return azList.map((az, idx) => {
    const sectorNum = idx + 1;
    const cid = sectorNum;
    const eci = enb * 256 + cid;
    return {
      sectorNum,
      azimuth: az,
      cid,
      eci,
    };
  });
}

