import { operatorName } from './operators.ts';

export type RatTech = '5G' | 'LTE' | 'UMTS' | 'GSM';

export interface BandAllocation {
  tech: RatTech;
  bandCode: string; // e.g. 'b20', 'b3', 'n78'
  freqMhz: number; // e.g. 800, 1800, 3500
  label: string; // e.g. '800 (b20)', '1800 (b3)', '3500 (n78)'
  channelType: 'EARFCN' | 'NR-ARFCN' | 'UARFCN' | 'ARFCN';
  duplex: 'FDD' | 'TDD';
  // Operator ranges in Poland: Map operator to allowed channel ranges
  operatorRanges: Record<string, { min: number; max: number; standard?: number }>;
  notes?: string;
}

export const POLISH_BAND_PLAN: BandAllocation[] = [
  // --- 4G LTE (sorted lowest to highest MHz) ---
  {
    tech: 'LTE',
    bandCode: 'b28',
    freqMhz: 700,
    label: '700 (b28)',
    channelType: 'EARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 9210, max: 9310, standard: 9260 },
      'Play': { min: 9311, max: 9410, standard: 9360 },
      'Plus': { min: 9411, max: 9510, standard: 9460 },
      'T-Mobile': { min: 9511, max: 9650, standard: 9560 },
    },
  },
  {
    tech: 'LTE',
    bandCode: 'b20',
    freqMhz: 800,
    label: '800 (b20)',
    channelType: 'EARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 6175, max: 6225, standard: 6200 },
      'Play': { min: 6226, max: 6275, standard: 6250 },
      'T-Mobile': { min: 6276, max: 6350, standard: 6300 },
      'Plus': { min: 6375, max: 6450, standard: 6400 },
    },
  },
  {
    tech: 'LTE',
    bandCode: 'b8',
    freqMhz: 900,
    label: '900 (b8)',
    channelType: 'EARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Plus': { min: 3500, max: 3550, standard: 3526 },
      'T-Mobile': { min: 3600, max: 3650, standard: 3625 },
      'Orange': { min: 3651, max: 3700, standard: 3675 },
      'Play': { min: 3701, max: 3750, standard: 3725 },
    },
  },
  {
    tech: 'LTE',
    bandCode: 'b3',
    freqMhz: 1800,
    label: '1800 (b3)',
    channelType: 'EARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Play': { min: 1275, max: 1449, standard: 1374 },
      'Orange': { min: 1450, max: 1599, standard: 1499 },
      'T-Mobile': { min: 1600, max: 1749, standard: 1649 },
      'Plus': { min: 1750, max: 1925, standard: 1800 },
    },
  },
  {
    tech: 'LTE',
    bandCode: 'b1',
    freqMhz: 2100,
    label: '2100 (b1)',
    channelType: 'EARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 75, max: 199, standard: 100 },
      'T-Mobile': { min: 200, max: 299, standard: 225 },
      'Play': { min: 300, max: 449, standard: 325 },
      'Plus': { min: 450, max: 599, standard: 475 },
    },
  },
  {
    tech: 'LTE',
    bandCode: 'b7',
    freqMhz: 2600,
    label: '2600 (b7)',
    channelType: 'EARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Plus': { min: 2775, max: 2950, standard: 2850 },
      'Play': { min: 2951, max: 3150, standard: 3000 },
      'Orange': { min: 3151, max: 3300, standard: 3200 },
      'T-Mobile': { min: 3301, max: 3450, standard: 3350 },
    },
  },
  {
    tech: 'LTE',
    bandCode: 'b38',
    freqMhz: 2600,
    label: '2600 TDD (b38)',
    channelType: 'EARFCN',
    duplex: 'TDD',
    // ONLY Plus operates B38 in Poland
    operatorRanges: {
      'Plus': { min: 37750, max: 38249, standard: 38000 },
    },
    notes: 'Pasmo TDD 2600 MHz jest w Polsce licencjonowane wyłącznie dla sieci Plus (Polkomtel / Aero2).',
  },

  // --- 5G NR (sorted lowest to highest MHz) ---
  {
    tech: '5G',
    bandCode: 'n28',
    freqMhz: 700,
    label: '700 (n28)',
    channelType: 'NR-ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 151600, max: 153800, standard: 152700 },
      'Play': { min: 153801, max: 156000, standard: 154900 },
      'Plus': { min: 156001, max: 158200, standard: 157100 },
      'T-Mobile': { min: 158201, max: 160600, standard: 159300 },
    },
  },
  {
    tech: '5G',
    bandCode: 'n20',
    freqMhz: 800,
    label: '800 (n20)',
    channelType: 'NR-ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 158200, max: 159999, standard: 159000 },
      'Play': { min: 160000, max: 161499, standard: 160750 },
      'T-Mobile': { min: 161500, max: 162999, standard: 162250 },
      'Plus': { min: 163000, max: 164200, standard: 163600 },
    },
  },
  {
    tech: '5G',
    bandCode: 'n8',
    freqMhz: 900,
    label: '900 (n8 DSS)',
    channelType: 'NR-ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Plus': { min: 185000, max: 186999, standard: 186000 },
      'T-Mobile': { min: 187000, max: 188999, standard: 188000 },
      'Orange': { min: 189000, max: 190999, standard: 190000 },
      'Play': { min: 191000, max: 192999, standard: 192000 },
    },
  },
  {
    tech: '5G',
    bandCode: 'n3',
    freqMhz: 1800,
    label: '1800 (n3 DSS)',
    channelType: 'NR-ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Play': { min: 361000, max: 364999, standard: 363000 },
      'Orange': { min: 365000, max: 368999, standard: 367000 },
      'T-Mobile': { min: 369000, max: 372999, standard: 371000 },
      'Plus': { min: 373000, max: 377000, standard: 375000 },
    },
  },
  {
    tech: '5G',
    bandCode: 'n1',
    freqMhz: 2100,
    label: '2100 (n1 DSS)',
    channelType: 'NR-ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 422000, max: 425000, standard: 423330 },
      'T-Mobile': { min: 425001, max: 428000, standard: 426670 },
      'Play': { min: 428001, max: 431000, standard: 429670 },
      'Plus': { min: 431001, max: 434000, standard: 432670 },
    },
  },
  {
    tech: '5G',
    bandCode: 'n38',
    freqMhz: 2600,
    label: '2600 TDD (n38/n41)',
    channelType: 'NR-ARFCN',
    duplex: 'TDD',
    // ONLY Plus operates 2600 TDD 5G
    operatorRanges: {
      'Plus': { min: 518000, max: 525000, standard: 520000 },
    },
    notes: 'Pasmo n38/n41 5G TDD w Polsce jest wykorzystywane wyłącznie przez Plus.',
  },
  {
    tech: '5G',
    bandCode: 'n78',
    freqMhz: 3500,
    label: '3500 (n78 C-Band)',
    channelType: 'NR-ARFCN',
    duplex: 'TDD',
    operatorRanges: {
      'Plus': { min: 640000, max: 643333, standard: 641666 },
      'Play': { min: 643334, max: 647333, standard: 645333 },
      'Orange': { min: 647334, max: 651333, standard: 649000 },
      'T-Mobile': { min: 651334, max: 655333, standard: 652666 },
    },
    notes: 'Aukcja pasma C 3.6 GHz (bloki 100 MHz po 2023 r.).',
  },

  // --- 3G UMTS (sorted lowest to highest MHz) ---
  {
    tech: 'UMTS',
    bandCode: 'B8',
    freqMhz: 900,
    label: '900 (B8)',
    channelType: 'UARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Plus': { min: 2937, max: 2975, standard: 2950 },
      'T-Mobile': { min: 2976, max: 3012, standard: 2990 },
      'Orange': { min: 3013, max: 3050, standard: 3037 },
      'Play': { min: 3051, max: 3088, standard: 3062 },
    },
  },
  {
    tech: 'UMTS',
    bandCode: 'B1',
    freqMhz: 2100,
    label: '2100 (B1)',
    channelType: 'UARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 10562, max: 10638, standard: 10563 },
      'T-Mobile': { min: 10639, max: 10712, standard: 10663 },
      'Play': { min: 10713, max: 10787, standard: 10738 },
      'Plus': { min: 10788, max: 10838, standard: 10813 },
    },
  },

  // --- 2G GSM (sorted lowest to highest MHz) ---
  {
    tech: 'GSM',
    bandCode: 'GSM900',
    freqMhz: 900,
    label: '900 GSM',
    channelType: 'ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Plus': { min: 1, max: 32, standard: 15 },
      'T-Mobile': { min: 33, max: 65, standard: 45 },
      'Orange': { min: 66, max: 97, standard: 80 },
      'Play': { min: 98, max: 124, standard: 110 },
    },
  },
  {
    tech: 'GSM',
    bandCode: 'GSM1800',
    freqMhz: 1800,
    label: '1800 DCS',
    channelType: 'ARFCN',
    duplex: 'FDD',
    operatorRanges: {
      'Orange': { min: 512, max: 605, standard: 550 },
      'T-Mobile': { min: 606, max: 700, standard: 650 },
      'Play': { min: 701, max: 795, standard: 750 },
      'Plus': { min: 796, max: 885, standard: 830 },
    },
  },
];

export interface CellInput {
  id?: string;
  tech: RatTech;
  band: string; // bandCode or label (e.g. 'b20', '800 (b20)', 'b38')
  pci: number | string;
  earfcn: number | string;
  nodeId?: number | string; // eNodeB ID / gNodeB ID / RNC
  cellId?: number | string; // Sector/CLID (1-255 for LTE, 1-65535 for UMTS/GSM)
  azimuth?: number | string;
  bandwidth?: number | string;
  isIot?: boolean;
  cellType?: 'macro' | 'micro' | 'indoor' | 'pico' | 'repeater';
  mode?: 'NSA' | 'SA';
  lac?: number | string;
  rnc?: number | string;
  bsic?: number | string;
  tac?: number | string;
  status?: string;
  notes?: string;
}

export interface CellValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function findBandAllocation(tech: string, bandStr: string): BandAllocation | undefined {
  const normalizedTech = tech.toUpperCase() === 'NR' ? '5G' : tech.toUpperCase();
  const raw = bandStr.trim().toLowerCase();
  if (!raw) return undefined;

  // 1. Exact match on bandCode or label
  const exact = POLISH_BAND_PLAN.find(b =>
    b.tech === normalizedTech &&
    (b.bandCode.toLowerCase() === raw || b.label.toLowerCase() === raw)
  );
  if (exact) return exact;

  // 2. Check TDD distinction for 2600 MHz
  if (raw.includes('2600') && raw.includes('tdd')) {
    const tddBand = POLISH_BAND_PLAN.find(b => b.tech === normalizedTech && (b.bandCode === 'b38' || b.bandCode === 'n38'));
    if (tddBand) return tddBand;
  }

  // 3. Check word boundary for bandCode (e.g. "b38", "n78", "b3")
  // Sort candidates by bandCode length descending so longer codes (b38) match before shorter (b3)
  const candidatesByTech = POLISH_BAND_PLAN.filter(b => b.tech === normalizedTech)
    .sort((a, b) => b.bandCode.length - a.bandCode.length);

  for (const b of candidatesByTech) {
    const code = b.bandCode.toLowerCase();
    const regex = new RegExp(`(^|[^a-z0-9])${code}([^a-z0-9]|$)`, 'i');
    if (regex.test(raw)) {
      return b;
    }
  }

  // 4. Match pure frequency if only one band of that tech has that freq
  const num = raw.replace(/\D/g, '');
  if (num) {
    const candidates = POLISH_BAND_PLAN.filter(b => b.tech === normalizedTech && String(b.freqMhz) === num);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      if (raw.includes('tdd')) return candidates.find(c => c.duplex === 'TDD') || candidates[0];
      return candidates.find(c => c.duplex === 'FDD') || candidates[0];
    }
  }

  return undefined;
}

export function getAvailableBandsForOperator(operatorInput: string, tech: RatTech): BandAllocation[] {
  const normOp = operatorName(operatorInput);
  return POLISH_BAND_PLAN.filter(b => {
    if (b.tech !== tech) return false;
    if (normOp === 'Inne') return true;
    return Boolean(b.operatorRanges[normOp]);
  }).sort((a, b) => a.freqMhz - b.freqMhz);
}

export function calculateEci(nodeId: number | string, cellId: number | string, tech: RatTech): number | null {
  const node = Number(nodeId);
  const cell = Number(cellId);
  if (!Number.isFinite(node) || node <= 0 || !Number.isFinite(cell) || cell < 0) return null;
  if (tech === '5G') {
    return node * 4096 + cell;
  }
  return node * 256 + cell;
}

/**
 * Validates a single cell against Polish operator rules.
 */
export function validateCell(cell: CellInput, rawOperator: string): CellValidationResult {
  const errors: Record<string, string> = {};
  const op = operatorName(rawOperator);
  const tech = (cell.tech?.toUpperCase() === 'NR' ? '5G' : cell.tech) as RatTech;

  if (!tech || !['5G', 'LTE', 'UMTS', 'GSM'].includes(tech)) {
    errors.tech = 'Nieprawidłowa technologia radiowa.';
    return { valid: false, errors };
  }

  // 1. Find Band
  const bandAlloc = findBandAllocation(tech, cell.band || '');
  if (!bandAlloc) {
    errors.band = 'Pasmo: nie ma go w planie pasm tego kraju.';
  } else if (op !== 'Inne' && !bandAlloc.operatorRanges[op]) {
    errors.band = `Pasmo ${bandAlloc.label}: operator ${op} nie posiada tego pasma w Polsce.`;
  }

  // 2. PCI Validation
  const rawPci = String(cell.pci ?? '').trim();
  if (rawPci === '') {
    errors.pci = 'Wymagane podanie PCI.';
  } else {
    const pciNum = Number(rawPci);
    if (!Number.isInteger(pciNum)) {
      errors.pci = 'PCI musi być liczbą całkowitą.';
    } else if (tech === 'LTE') {
      if (pciNum < 0 || pciNum > 503) {
        errors.pci = 'PCI musi być w zakresie 0-503 (LTE).';
      }
    } else if (tech === '5G') {
      if (pciNum < 0 || pciNum > 1007) {
        errors.pci = 'PCI musi być w zakresie 0-1007 (5G NR).';
      }
    } else if (tech === 'UMTS') {
      if (pciNum < 0 || pciNum > 511) {
        errors.pci = 'PSC musi być w zakresie 0-511 (UMTS).';
      }
    } else if (tech === 'GSM') {
      if (pciNum < 0 || pciNum > 63) {
        errors.pci = 'BSIC musi być w zakresie 0-63 (GSM).';
      }
    }
  }

  // 3. EARFCN / ARFCN Validation
  const rawChannel = String(cell.earfcn ?? '').trim();
  const chType = bandAlloc?.channelType || 'EARFCN';
  if (rawChannel === '') {
    errors.earfcn = `Wymagane podanie ${chType}.`;
  } else {
    const chNum = Number(rawChannel);
    if (!Number.isInteger(chNum)) {
      errors.earfcn = `${chType} musi być liczbą całkowitą.`;
    } else if (bandAlloc && op !== 'Inne' && bandAlloc.operatorRanges[op]) {
      const range = bandAlloc.operatorRanges[op];
      if (chNum < range.min || chNum > range.max) {
        errors.earfcn = `Nieprawidłowy ${chType} ${chNum} dla pasma ${bandAlloc.label} u operatora ${op} (dozwolony zakres: ${range.min} - ${range.max}).`;
      }
    }
  }

  // 4. CID / CLID Validation
  const rawCellId = cell.cellId !== undefined && cell.cellId !== null ? String(cell.cellId).trim() : '';
  if (tech === 'LTE') {
    if (rawCellId === '') {
      errors.cellId = 'Wymagane podanie CID (CLID).';
    } else {
      const cidNum = Number(rawCellId);
      if (!Number.isInteger(cidNum) || cidNum < 1 || cidNum > 255) {
        errors.cellId = 'Nieprawidłowy CLID dla LTE (dozwolony zakres: 1-255).';
      }
    }
  } else if (tech === 'UMTS') {
    if (rawCellId === '') {
      errors.cellId = 'Wymagane podanie CID.';
    } else {
      const cidNum = Number(rawCellId);
      if (!Number.isInteger(cidNum) || cidNum < 1 || cidNum > 65535) {
        errors.cellId = 'Nieprawidłowy CID dla UMTS (dozwolony zakres: 1-65535).';
      }
    }
  } else if (tech === 'GSM') {
    if (rawCellId === '') {
      errors.cellId = 'Wymagane podanie CID.';
    } else {
      const cidNum = Number(rawCellId);
      if (!Number.isInteger(cidNum) || cidNum < 1 || cidNum > 65535) {
        errors.cellId = 'Nieprawidłowy CID dla GSM (dozwolony zakres: 1-65535).';
      }
    }
  } else if (tech === '5G' && rawCellId !== '') {
    const cidNum = Number(rawCellId);
    if (!Number.isInteger(cidNum) || cidNum < 1 || cidNum > 16383) {
      errors.cellId = 'Nieprawidłowy NCI dla 5G NR (dozwolony zakres: 1-16383).';
    }
  }

  // 5. Node ID validation (eNodeB / gNodeB / RNC)
  if (cell.nodeId !== undefined && cell.nodeId !== null && String(cell.nodeId).trim() !== '') {
    const n = Number(cell.nodeId);
    if (!Number.isInteger(n) || n <= 0) {
      errors.nodeId = 'ID stacji bazowej (eNB/gNB) musi być dodatnią liczbą całkowitą.';
    } else if (tech === 'LTE' && n > 1048575) {
      errors.nodeId = 'Nieprawidłowy eNBID dla LTE (maksymalnie 1048575).';
    }
  }

  // 6. Azimuth validation (if provided)
  if (cell.azimuth !== undefined && cell.azimuth !== null && String(cell.azimuth).trim() !== '' && String(cell.azimuth).trim() !== '-') {
    const az = Number(cell.azimuth);
    if (!Number.isFinite(az) || az < 0 || az > 360) {
      errors.azimuth = 'Azymut musi być wartością w zakresie 0° - 360°.';
    }
  }

  // 7. LAC / TAC validation (if provided)
  if (cell.lac !== undefined && cell.lac !== null && String(cell.lac).trim() !== '') {
    const l = Number(cell.lac);
    if (!Number.isInteger(l) || l < 1 || l > 65535) {
      errors.lac = 'LAC musi być liczbą w zakresie 1-65535.';
    }
  }
  if (cell.tac !== undefined && cell.tac !== null && String(cell.tac).trim() !== '') {
    const t = Number(cell.tac);
    if (!Number.isInteger(t) || t < 1 || t > 65535) {
      errors.tac = 'TAC musi być liczbą w zakresie 1-65535.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface StationSubmissionInput {
  operator: string;
  stationId: string;
  address: string;
  province?: string;
  lat: number;
  lng: number;
  mastType?: string;
  owner?: string;
  height?: number;
  notes?: string;
  azimuths?: number[];
  technologies?: RatTech[];
  cells: CellInput[];
}

export interface StationSubmissionValidationResult {
  valid: boolean;
  errorCount: number;
  stationErrors: Record<string, string>;
  cellErrors: Record<string, Record<string, string>>; // cellId/index -> errors
}

/**
 * Validates the entire station submission payload.
 */
export function validateStationSubmission(submission: StationSubmissionInput): StationSubmissionValidationResult {
  const stationErrors: Record<string, string> = {};
  const cellErrors: Record<string, Record<string, string>> = {};
  let totalErrors = 0;

  if (!submission.operator || !submission.operator.trim()) {
    stationErrors.operator = 'Wybierz operatora stacji.';
    totalErrors++;
  }
  if (!submission.stationId || !submission.stationId.trim()) {
    stationErrors.stationId = 'Podaj identyfikator stacji (ID stacji).';
    totalErrors++;
  }
  if (!submission.address || submission.address.trim().length < 3) {
    stationErrors.address = 'Podaj poprawny adres lub miejscowość (min. 3 znaki).';
    totalErrors++;
  }
  if (!Number.isFinite(submission.lat) || submission.lat < 49.0 || submission.lat > 55.0) {
    stationErrors.lat = 'Szerokość geograficzna (szer. N) musi mieścić się w granicach Polski (49.0 - 55.0).';
    totalErrors++;
  }
  if (!Number.isFinite(submission.lng) || submission.lng < 14.0 || submission.lng > 24.5) {
    stationErrors.lng = 'Długość geograficzna (dł. E) musi mieścić się w granicach Polski (14.0 - 24.5).';
    totalErrors++;
  }

  if (!submission.cells || submission.cells.length === 0) {
    stationErrors.cells = 'Dodaj co najmniej jedną komórkę (sektor) do stacji.';
    totalErrors++;
  } else {
    submission.cells.forEach((cell, idx) => {
      const key = cell.id || String(idx);
      const res = validateCell(cell, submission.operator);
      if (!res.valid) {
        cellErrors[key] = res.errors;
        totalErrors += Object.keys(res.errors).length;
      }
    });
  }

  return {
    valid: totalErrors === 0,
    errorCount: totalErrors,
    stationErrors,
    cellErrors,
  };
}
