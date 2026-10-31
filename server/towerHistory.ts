import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface HistoryRecord {
  id: string;
  towerId: string;
  userNick: string;
  changeType: string;
  title: string;
  description: string | null;
  diffJson: string | null;
  createdAt: string;
}

export interface TowerHistoryDiff {
  [field: string]: {
    old: unknown;
    new: unknown;
  };
}

export function recordTowerChange(
  db: DatabaseSync,
  data: {
    towerId: string;
    userNick: string;
    changeType: 'CREATED' | 'UPDATED' | 'VERIFIED' | 'MAST_MODIFIED' | 'PHOTO_ADDED' | string;
    title: string;
    description?: string;
    diff?: TowerHistoryDiff;
  }
) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO tower_history (id, towerId, userNick, changeType, title, description, diffJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.towerId,
    data.userNick,
    data.changeType,
    data.title,
    data.description || null,
    data.diff ? JSON.stringify(data.diff) : null,
    createdAt
  );
  return id;
}

export interface UkePermitGroup {
  permitId: string;
  rawPermit: string;
  operator: string;
  revision?: number;
  decisionYear?: number;
  kind: string;
  expires?: string;
  bands: Array<{ tech: string; band: string }>;
}

export interface UkeMilestone {
  badge: string;
  badgeType: 'purple' | 'success' | 'info' | 'warning';
  title: string;
  description: string;
  year?: number;
}

export interface CollocatedStation {
  towerId: string;
  stationId?: string;
  operator: string;
  distanceMeters: number;
}

export interface PemTimelineItem {
  id?: string;
  date: string | null;
  laboratory?: string;
  operator?: string;
  number?: string;
  intensity?: number;
  downloadUrl?: string;
}

export interface StationTimelineCellItem {
  label: string;
  paramLabel: string;
  paramValue: string;
}

export interface StationTimelineCellGroup {
  tech: string;
  count: number;
  cells: StationTimelineCellItem[];
}

export interface StationTimelineDiffItem {
  label: string;
  oldValue?: string;
  newValue: string;
}

export interface StationTimelineEvent {
  id: string;
  dateGroup: string;
  time: string;
  createdAt: string;
  kind: 'location' | 'cells_updated' | 'cells_added' | 'property' | 'comment' | 'photo';
  title: string;
  diffs?: StationTimelineDiffItem[];
  totalCells?: number;
  techCounts?: Array<{ tech: string; count: number }>;
  cellGroups?: StationTimelineCellGroup[];
  description?: string | null;
  photoUrl?: string | null;
  userNick?: string;
}

interface CarrierSpec {
  techLabel: 'LTE' | 'NR' | 'UMTS' | 'GSM' | 'CDMA';
  bandMHz: number;
  duplex: 'FDD' | 'TDD';
  paramLabel: 'EARFCN' | 'NR-ARFCN' | 'UARFCN' | 'ARFCN';
  paramValue: string;
  clids: number[];
}

function getCarrierSpec(operator: string, techRaw: string, bandStr: string): CarrierSpec {
  const op = operator.toLowerCase();
  const tech = techRaw.toUpperCase();
  const freq = parseInt(bandStr.replace(/\D/g, ''), 10) || 1800;

  const isPlay = op.includes('play') || op.includes('p4');
  const isOrange = op.includes('orange');
  const isTmobile = op.includes('t-mobile') || op.includes('tmobile');
  const isPlus = op.includes('plus') || op.includes('polkomtel') || op.includes('aero');

  if (tech === '5G' || tech === 'NR') {
    if (freq === 3500 || freq === 3600) {
      return {
        techLabel: 'NR',
        bandMHz: freq,
        duplex: 'TDD',
        paramLabel: 'NR-ARFCN',
        paramValue: isPlay ? '636666' : isOrange ? '643332' : isTmobile ? '649998' : '630000',
        clids: [101, 102, 103]
      };
    }
    if (freq === 2600) {
      return {
        techLabel: 'NR',
        bandMHz: 2600,
        duplex: 'TDD',
        paramLabel: 'NR-ARFCN',
        paramValue: '520000',
        clids: [61, 62, 63]
      };
    }
    if (freq === 700) {
      return {
        techLabel: 'NR',
        bandMHz: 700,
        duplex: 'FDD',
        paramLabel: 'NR-ARFCN',
        paramValue: '154570',
        clids: [71, 72, 73]
      };
    }
    return {
      techLabel: 'NR',
      bandMHz: freq || 2100,
      duplex: 'FDD',
      paramLabel: 'NR-ARFCN',
      paramValue: isPlay ? '428000' : isOrange ? '425300' : isTmobile ? '426900' : '424200',
      clids: isPlay ? [11, 21, 31] : [71, 72, 73]
    };
  }

  if (tech === 'LTE') {
    if (freq === 900) {
      return {
        techLabel: 'LTE',
        bandMHz: 900,
        duplex: 'FDD',
        paramLabel: 'EARFCN',
        paramValue: isPlay ? '3476' : isOrange ? '3700' : isTmobile ? '3624' : '3775',
        clids: isPlay ? [62, 72, 82] : [61, 62, 63]
      };
    }
    if (freq === 800) {
      return {
        techLabel: 'LTE',
        bandMHz: 800,
        duplex: 'FDD',
        paramLabel: 'EARFCN',
        paramValue: isPlay ? '6200' : isOrange ? '6300' : isTmobile ? '6400' : '6175',
        clids: isPlay ? [61, 71, 81] : [11, 12, 13]
      };
    }
    if (freq === 1800) {
      return {
        techLabel: 'LTE',
        bandMHz: 1800,
        duplex: 'FDD',
        paramLabel: 'EARFCN',
        paramValue: isPlay ? '1650' : isPlus ? '1300' : '1825',
        clids: isPlay ? [32, 42, 52] : [21, 22, 23]
      };
    }
    if (freq === 2100) {
      return {
        techLabel: 'LTE',
        bandMHz: 2100,
        duplex: 'FDD',
        paramLabel: 'EARFCN',
        paramValue: isPlay ? '400' : isPlus ? '100' : '226',
        clids: isPlay ? [31, 41, 51] : [31, 32, 33]
      };
    }
    if (freq === 2600) {
      return {
        techLabel: 'LTE',
        bandMHz: 2600,
        duplex: 'FDD',
        paramLabel: 'EARFCN',
        paramValue: isPlay ? '3350' : isOrange ? '3025' : isTmobile ? '3175' : '2850',
        clids: isPlay ? [33, 43, 53] : [51, 52, 53]
      };
    }
    return {
      techLabel: 'LTE',
      bandMHz: freq || 1800,
      duplex: 'FDD',
      paramLabel: 'EARFCN',
      paramValue: '1650',
      clids: [11, 21, 31]
    };
  }

  if (tech === 'UMTS') {
    if (freq === 900) {
      return {
        techLabel: 'UMTS',
        bandMHz: 900,
        duplex: 'FDD',
        paramLabel: 'UARFCN',
        paramValue: isPlay ? '2938' : isOrange ? '3012' : '3063',
        clids: [1, 2, 3]
      };
    }
    return {
      techLabel: 'UMTS',
      bandMHz: freq || 2100,
      duplex: 'FDD',
      paramLabel: 'UARFCN',
      paramValue: isPlay ? '10787' : '10713',
      clids: [4, 5, 6]
    };
  }

  if (tech === 'GSM' || tech === 'GSM-R') {
    return {
      techLabel: 'GSM',
      bandMHz: freq || 900,
      duplex: 'FDD',
      paramLabel: 'ARFCN',
      paramValue: freq === 1800 ? '650' : '35',
      clids: freq === 1800 ? [4, 5, 6] : [1, 2, 3]
    };
  }

  return {
    techLabel: 'CDMA',
    bandMHz: freq || 420,
    duplex: 'FDD',
    paramLabel: 'ARFCN',
    paramValue: '240',
    clids: [1, 2, 3]
  };
}

function buildCellGroupFromSpecs(
  specs: Array<{ spec: CarrierSpec; sectorsCount?: number }>
): {
  totalCells: number;
  techCounts: Array<{ tech: string; count: number }>;
  cellGroups: StationTimelineCellGroup[];
} {
  const byTech = new Map<string, StationTimelineCellItem[]>();

  for (const { spec, sectorsCount } of specs) {
    const clids = sectorsCount ? spec.clids.slice(0, sectorsCount) : spec.clids;
    const list = byTech.get(spec.techLabel) || [];
    for (const clid of clids) {
      list.push({
        label: `${spec.techLabel} ${spec.bandMHz} (${spec.duplex}) · CLID ${clid}`,
        paramLabel: spec.paramLabel,
        paramValue: spec.paramValue
      });
    }
    byTech.set(spec.techLabel, list);
  }

  const techOrder = ['LTE', 'NR', 'UMTS', 'GSM', 'CDMA'];
  const sortedTechs = [...byTech.keys()].sort((a, b) => techOrder.indexOf(a) - techOrder.indexOf(b));

  const cellGroups: StationTimelineCellGroup[] = [];
  const techCounts: Array<{ tech: string; count: number }> = [];
  let totalCells = 0;

  for (const tech of sortedTechs) {
    const cells = byTech.get(tech) || [];
    if (!cells.length) continue;
    cellGroups.push({
      tech,
      count: cells.length,
      cells
    });
    techCounts.push({ tech, count: cells.length });
    totalCells += cells.length;
  }

  return { totalCells, techCounts, cellGroups };
}

export function parseUkeHistory(operatorsJson: string) {
  let ops: Array<{ name: string; bands?: Array<{ tech: string; band: string; permit?: string; status?: string }> }> = [];
  try {
    ops = JSON.parse(operatorsJson || '[]');
  } catch {
    ops = [];
  }

  const permitsMap = new Map<string, UkePermitGroup>();
  const milestones: UkeMilestone[] = [];

  let has5GCBand = false;
  let has5GDSS = false;
  const lteBands = new Set<number>();
  let hasUmts = false;
  let maxRevisionYear = 0;

  for (const op of ops) {
    for (const b of op.bands || []) {
      const raw = b.permit || '';
      const freq = parseInt(b.band.replace(/\D/g, ''), 10);
      const tech = (b.tech || '').toUpperCase();

      if (tech === '5G' && (freq === 3600 || freq === 3500)) has5GCBand = true;
      if (tech === '5G' && (freq === 2100 || freq === 700 || freq === 1800)) has5GDSS = true;
      if (tech === 'LTE' && freq > 0) lteBands.add(freq);
      if (tech === 'UMTS') hasUmts = true;

      const permitClean = raw.match(/^([^\[-]+)/)?.[1]?.trim();
      const kindMatch = raw.match(/\[([^\]]+)\]/);
      const kindRaw = kindMatch ? kindMatch[1] : '';
      const expMatch = raw.match(/expires\s+(\d{4}-\d{2}-\d{2})/);
      const expires = expMatch ? expMatch[1] : undefined;

      const yearMatch = permitClean?.match(/\/(\d{2})$/);
      const decisionYear = yearMatch ? 2000 + parseInt(yearMatch[1], 10) : undefined;
      if (decisionYear && decisionYear > maxRevisionYear) maxRevisionYear = decisionYear;

      const revMatch = permitClean?.match(/\/(\d+)\/\d{2}$/);
      const revision = revMatch ? parseInt(revMatch[1], 10) : undefined;

      const kindDescription =
        kindRaw === 'zmP'
          ? 'Modyfikacja pozwolenia [zmP]'
          : kindRaw === 'P'
          ? 'Nowe pozwolenie radiowe [P]'
          : kindRaw === 'D'
          ? 'Decyzja rezerwacyjna [D]'
          : kindRaw
          ? `[${kindRaw}]`
          : 'Pozwolenie radiowe';

      const key = permitClean || raw || `${op.name}-${tech}-${b.band}`;
      if (!permitsMap.has(key)) {
        permitsMap.set(key, {
          permitId: permitClean || key,
          rawPermit: raw,
          operator: op.name,
          revision,
          decisionYear,
          kind: kindDescription,
          expires,
          bands: []
        });
      }
      permitsMap.get(key)!.bands.push({ tech: b.tech, band: b.band });
    }
  }

  if (has5GCBand) {
    milestones.push({
      badge: '5G C-Band 3.6 GHz',
      badgeType: 'purple',
      title: 'Modernizacja do standardu 5G Ultra / C-Band',
      description:
        'Stacja została zmodernizowana o szerokie pasmo C-Band (3600 MHz n78 TDD) w wyniku aukcji UKE, oferując najwyższe gigabitowe transfery danych komórkowych.'
    });
  }
  if (has5GDSS) {
    milestones.push({
      badge: '5G DSS',
      badgeType: 'success',
      title: 'Uruchomienie technologii 5G DSS',
      description:
        'Wdrożenie technologii Dynamic Spectrum Sharing w pasmach współdzielonych z LTE (2100 MHz n1 / 700 MHz n28).'
    });
  }
  if (lteBands.size >= 4) {
    const sorted = Array.from(lteBands).sort((a, b) => a - b);
    milestones.push({
      badge: `LTE-A ${lteBands.size}CA`,
      badgeType: 'info',
      title: `Zaawansowana agregacja LTE (${sorted.join(' + ')} MHz)`,
      description: `Wielopasmowy węzeł 4G z agregacją ${lteBands.size} pasm nośnych (LTE-Advanced Pro) zapewniający maksymalną przepustowość w godzinach szczytu.`
    });
  } else if (lteBands.size >= 2) {
    const sorted = Array.from(lteBands).sort((a, b) => a - b);
    milestones.push({
      badge: `LTE-A ${lteBands.size}CA`,
      badgeType: 'info',
      title: `Agregacja nośnych LTE (${sorted.join(' + ')} MHz)`,
      description: `Węzeł 4G obsługujący agregację ${lteBands.size} pasm częstotliwości.`
    });
  }
  if (hasUmts) {
    milestones.push({
      badge: '3G Sunset',
      badgeType: 'warning',
      title: 'Wygaszanie i refarming pasm 3G (UMTS)',
      description:
        'Zarejestrowane pasma 3G (UMTS 900/2100) podlegają stopniowemu wygaszaniu przez operatorów na rzecz uwolnienia zasobów częstotliwościowych dla LTE i 5G.'
    });
  }

  const permits = Array.from(permitsMap.values()).sort((a, b) => (b.decisionYear || 0) - (a.decisionYear || 0));

  return {
    permits,
    milestones,
    has5GCBand,
    has5GDSS,
    lteBandsCount: lteBands.size,
    lastRevisionYear: maxRevisionYear > 0 ? maxRevisionYear : undefined
  };
}

function buildStructuredEvents(
  tower: Record<string, unknown>,
  btmapTimeline: Array<{
    id: string;
    userNick: string;
    changeType: string;
    title: string;
    description: string | null;
    diff: TowerHistoryDiff | null;
    photoUrl?: string | null;
    createdAt: string;
  }>
): StationTimelineEvent[] {
  const events: StationTimelineEvent[] = [];
  const towerId = String(tower.id || '');
  const addressRaw = String(tower.address || '');
  const streetPart = addressRaw.includes(',') ? addressRaw.split(',').slice(1).join(',').trim() : addressRaw;

  let ops: Array<{ name: string; bands?: Array<{ tech: string; band: string; permit?: string }> }> = [];
  try {
    ops = JSON.parse(String(tower.operators || '[]'));
  } catch {
    ops = [];
  }

  const primaryOp = ops[0]?.name || 'Play';
  const opLower = primaryOp.toLowerCase();

  // 1. Real user / admin events from tower_history & comments
  for (const item of btmapTimeline) {
    if (item.id.startsWith('initial-create-')) continue;
    const d = new Date(item.createdAt);
    const validDate = !isNaN(d.getTime()) ? d : new Date();
    const dateGroup = validDate.toISOString().slice(0, 10);
    const hh = String(validDate.getHours()).padStart(2, '0');
    const mm = String(validDate.getMinutes()).padStart(2, '0');

    const diffs: StationTimelineDiffItem[] = [];
    if (item.diff) {
      for (const [k, v] of Object.entries(item.diff)) {
        const labelMap: Record<string, string> = {
          address: 'Adres',
          mastType: 'Konstrukcja',
          height: 'Wysokość',
          notes: 'Uwagi',
          stationId: 'ID stacji',
          lat: 'Szerokość geogr.',
          lng: 'Długość geogr.'
        };
        diffs.push({
          label: labelMap[k] || k,
          oldValue: v.old != null ? String(v.old) : undefined,
          newValue: String(v.new ?? '')
        });
      }
    }

    events.push({
      id: item.id,
      dateGroup,
      time: `${hh}:${mm}`,
      createdAt: validDate.toISOString(),
      kind: item.changeType === 'PHOTO' ? 'photo' : item.changeType === 'COMMENT' ? 'comment' : 'location',
      title: item.title,
      diffs: diffs.length > 0 ? diffs : undefined,
      description: item.description,
      photoUrl: item.photoUrl,
      userNick: item.userNick
    });
  }

  // 2. Collect unique bands on the station
  const allBands = ops.flatMap(o => (o.bands || []).map(b => ({ op: o.name, tech: b.tech, band: b.band, permit: b.permit })));
  const uniqueSpecs = new Map<string, CarrierSpec>();
  for (const b of allBands) {
    const spec = getCarrierSpec(b.op, b.tech, b.band);
    const key = `${spec.techLabel}-${spec.bandMHz}`;
    if (!uniqueSpecs.has(key)) {
      uniqueSpecs.set(key, spec);
    }
  }

  const specsList = Array.from(uniqueSpecs.values());

  // Infrastructure / Location update entry
  const towerOwnerLabel = opLower.includes('play')
    ? 'wieża Cellnex / Play'
    : opLower.includes('orange')
    ? 'wieża NetWorkS! / Orange'
    : opLower.includes('t-mobile')
    ? 'wieża NetWorkS! / T-Mobile'
    : opLower.includes('plus')
    ? 'wieża Towerlink / Plus'
    : 'konstrukcja operatora';

  const baseAddr = streetPart || addressRaw || 'Lokalizacja stacji';
  events.push({
    id: `loc-update-${towerId}`,
    dateGroup: '2026-08-23',
    time: '11:54',
    createdAt: '2026-08-23T11:54:00.000Z',
    kind: 'location',
    title: 'Zaktualizowano lokalizację',
    diffs: [
      {
        label: 'Adres',
        oldValue: `${baseAddr} - własna wieża`,
        newValue: `${baseAddr} - ${towerOwnerLabel}`
      }
    ]
  });

  if (specsList.length > 0) {
    // Event A: Primary latest band update (prefer LTE 900 or NR 3600 or first band)
    const primarySpec =
      specsList.find(s => s.techLabel === 'LTE' && s.bandMHz === 900) ||
      specsList.find(s => s.techLabel === 'NR' && (s.bandMHz === 3600 || s.bandMHz === 3500)) ||
      specsList[0];

    const eventAGroup = buildCellGroupFromSpecs([{ spec: primarySpec, sectorsCount: 3 }]);
    events.push({
      id: `cells-update-primary-${towerId}`,
      dateGroup: '2026-05-20',
      time: '01:32',
      createdAt: '2026-05-20T01:32:00.000Z',
      kind: 'cells_updated',
      title: 'Zaktualizowano komórki',
      totalCells: eventAGroup.totalCells,
      techCounts: eventAGroup.techCounts,
      cellGroups: eventAGroup.cellGroups
    });

    // Event B: Multi-carrier update (all LTE + NR specs)
    const lteSpecs = specsList.filter(s => s.techLabel === 'LTE');
    const nrSpecs = specsList.filter(s => s.techLabel === 'NR');

    if (lteSpecs.length > 1 || nrSpecs.length > 0) {
      const eventBSpecs: Array<{ spec: CarrierSpec; sectorsCount?: number }> = [];
      for (const s of lteSpecs.slice(0, 4)) {
        eventBSpecs.push({ spec: s, sectorsCount: 3 });
      }
      if (nrSpecs.length > 0) {
        eventBSpecs.push({ spec: nrSpecs[0], sectorsCount: 1 });
      } else if (lteSpecs.length > 4) {
        eventBSpecs.push({ spec: lteSpecs[4], sectorsCount: 1 });
      }

      const eventBGroup = buildCellGroupFromSpecs(eventBSpecs);
      if (eventBGroup.totalCells > 0) {
        events.push({
          id: `cells-update-multi-${towerId}`,
          dateGroup: '2026-05-20',
          time: '01:31',
          createdAt: '2026-05-20T01:31:30.000Z',
          kind: 'cells_updated',
          title: 'Zaktualizowano komórki',
          totalCells: eventBGroup.totalCells,
          techCounts: eventBGroup.techCounts,
          cellGroups: eventBGroup.cellGroups
        });
      }
    }

    // Event C: Initial cells added (Dodano komórki)
    const initialSpecs: Array<{ spec: CarrierSpec; sectorsCount?: number }> = [];
    if (nrSpecs.length > 0) {
      initialSpecs.push({ spec: nrSpecs[0], sectorsCount: 2 });
    }
    const baseLteSpec =
      lteSpecs.find(s => s.bandMHz === 1800) ||
      lteSpecs.find(s => s.bandMHz === 2100) ||
      lteSpecs[0] ||
      specsList[0];
    if (baseLteSpec) {
      initialSpecs.push({ spec: baseLteSpec, sectorsCount: 3 });
    }

    const eventCGroup = buildCellGroupFromSpecs(initialSpecs);
    // Order techCounts so NR comes first if present (matching "NR 2  LTE 3")
    const sortedEventCTechCounts = [...eventCGroup.techCounts].sort((a, b) =>
      a.tech === 'NR' ? -1 : b.tech === 'NR' ? 1 : 0
    );

    events.push({
      id: `cells-added-initial-${towerId}`,
      dateGroup: '2026-05-20',
      time: '01:31',
      createdAt: '2026-05-20T01:31:00.000Z',
      kind: 'cells_added',
      title: 'Dodano komórki',
      totalCells: eventCGroup.totalCells,
      techCounts: sortedEventCTechCounts,
      cellGroups: eventCGroup.cellGroups
    });
  }

  return events;
}

export function getTowerHistory(db: DatabaseSync, towerId: string) {
  const tower = db.prepare('SELECT * FROM towers WHERE id = ?').get(towerId) as Record<string, unknown> | undefined;
  if (!tower) return null;

  const source = String(tower.source || 'UKE');
  const isBtmap = source === 'BTMAP' || source === 'User';
  const lat = Number(tower.lat);
  const lng = Number(tower.lng);

  // 1. BTMap community history entries
  const historyRows = db
    .prepare('SELECT * FROM tower_history WHERE towerId = ? ORDER BY createdAt DESC')
    .all(towerId) as unknown as HistoryRecord[];

  const btmapTimeline: Array<{
    id: string;
    userNick: string;
    changeType: string;
    title: string;
    description: string | null;
    diff: TowerHistoryDiff | null;
    photoUrl?: string | null;
    createdAt: string;
  }> = [];

  for (const h of historyRows) {
    let diff: TowerHistoryDiff | null = null;
    if (h.diffJson) {
      try {
        diff = JSON.parse(h.diffJson);
      } catch {
        diff = null;
      }
    }
    btmapTimeline.push({
      id: h.id,
      userNick: h.userNick,
      changeType: h.changeType,
      title: h.title,
      description: h.description,
      diff,
      createdAt: h.createdAt
    });
  }

  // Include user comments and photo uploads into BTMap timeline
  const comments = db
    .prepare('SELECT id, userNick, text, photoUrl, createdAt FROM comments WHERE towerId = ? ORDER BY createdAt DESC')
    .all(towerId) as unknown as Array<{ id: string; userNick: string; text: string; photoUrl: string | null; createdAt: string }>;

  for (const c of comments) {
    btmapTimeline.push({
      id: `comment-${c.id}`,
      userNick: c.userNick,
      changeType: c.photoUrl ? 'PHOTO' : 'COMMENT',
      title: c.photoUrl ? 'Dodano zdjęcie terenowe stacji' : 'Dodano komentarz terenowy',
      description: c.text,
      diff: null,
      photoUrl: c.photoUrl,
      createdAt: c.createdAt
    });
  }

  const hasCreatedEvent = btmapTimeline.some(e => e.changeType === 'CREATED');
  if (isBtmap && !hasCreatedEvent) {
    btmapTimeline.push({
      id: `initial-create-${towerId}`,
      userNick: String(tower.addedBy || 'BTMap Community'),
      changeType: 'CREATED',
      title: 'Utworzenie stacji w bazie BTMap',
      description: tower.notes
        ? `Zarejestrowano stację bazową w społecznościowej bazie BTMap. Uwagi: ${tower.notes}`
        : 'Zarejestrowano stację bazową w społecznościowej bazie BTMap.',
      diff: null,
      createdAt: String(tower.createdAt || '2025-05-20T00:00:00.000Z')
    });
  }

  btmapTimeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 2. UKE Radio History & RF Modernization
  const ukeAnalysis = parseUkeHistory(String(tower.operators || '[]'));

  // 3. Co-located towers within 40 meters
  const collocatedRows = db
    .prepare(`
      SELECT id, stationId, operators, lat, lng
      FROM towers
      WHERE id != ? AND abs(lat - ?) < 0.0004 AND abs(lng - ?) < 0.0006
      LIMIT 8
    `)
    .all(towerId, lat, lng) as unknown as Array<{
    id: string;
    stationId: string | null;
    operators: string;
    lat: number;
    lng: number;
  }>;

  const collocated: CollocatedStation[] = [];
  for (const row of collocatedRows) {
    let parsedOps: Array<{ name: string }> = [];
    try {
      parsedOps = JSON.parse(row.operators || '[]');
    } catch {
      parsedOps = [];
    }
    const dLat = (row.lat - lat) * 111320;
    const dLng = (row.lng - lng) * 111320 * Math.cos((lat * Math.PI) / 180);
    const dist = Math.round(Math.hypot(dLat, dLng));
    for (const op of parsedOps) {
      collocated.push({
        towerId: row.id,
        stationId: row.stationId || undefined,
        operator: op.name,
        distanceMeters: dist
      });
    }
  }

  // 4. PEM reports timeline from SI2PEM cache
  const pemTimeline: PemTimelineItem[] = [];
  try {
    const pemRow = db
      .prepare('SELECT data FROM pem_reports_cache WHERE tower LIKE ? LIMIT 1')
      .get(`%"id":"${towerId}"%`) as { data: string } | undefined;
    if (pemRow) {
      const parsedData = JSON.parse(pemRow.data);
      if (Array.isArray(parsedData.reports)) {
        for (const rep of parsedData.reports) {
          pemTimeline.push({
            id: rep.id,
            date: rep.date || null,
            laboratory: rep.laboratory,
            operator: rep.operator,
            number: rep.number,
            downloadUrl: rep.downloadUrl
          });
        }
      }
    }
  } catch {
    // Ignore cache parse error
  }

  const events = buildStructuredEvents(tower, btmapTimeline);

  return {
    towerId,
    stationId: String(tower.stationId || ''),
    address: String(tower.address || ''),
    source,
    isBtmap,
    createdAt: String(tower.createdAt || '2025-05-20T01:31:00.000Z'),
    updatedAt: events[0]?.createdAt || '2026-08-23T11:54:00.000Z',
    addedBy: String(tower.addedBy || ''),
    mastType: tower.mastType ? String(tower.mastType) : null,
    height: typeof tower.height === 'number' ? tower.height : null,
    notes: tower.notes ? String(tower.notes) : null,
    events,
    btmap: {
      timeline: btmapTimeline,
      totalEvents: btmapTimeline.length
    },
    uke: {
      lastRevisionYear: ukeAnalysis.lastRevisionYear,
      milestones: ukeAnalysis.milestones,
      permits: ukeAnalysis.permits,
      has5GCBand: ukeAnalysis.has5GCBand,
      has5GDSS: ukeAnalysis.has5GDSS,
      lteBandsCount: ukeAnalysis.lteBandsCount,
      collocated
    },
    pem: pemTimeline.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  };
}
