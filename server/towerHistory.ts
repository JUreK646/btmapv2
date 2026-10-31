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
  paramLabel?: string;
  paramValue?: string;
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
  time?: string;
  createdAt: string;
  kind: 'location' | 'cells_updated' | 'cells_added' | 'permit' | 'pem' | 'created' | 'property' | 'comment' | 'photo';
  title: string;
  subtitle?: string;
  diffs?: StationTimelineDiffItem[];
  totalCells?: number;
  techCounts?: Array<{ tech: string; count: number }>;
  cellGroups?: StationTimelineCellGroup[];
  description?: string | null;
  photoUrl?: string | null;
  userNick?: string;
  downloadUrl?: string;
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

function buildRealTimelineEvents(
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
  }>,
  ukeAnalysis: ReturnType<typeof parseUkeHistory>,
  pemTimeline: PemTimelineItem[]
): StationTimelineEvent[] {
  const events: StationTimelineEvent[] = [];
  const towerId = String(tower.id || '');
  const isBtmap = tower.source === 'BTMAP' || tower.source === 'User';

  // 1. Real Community / User / Admin Edits (from tower_history & comments)
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
          lng: 'Długość geogr.',
          owner: 'Właściciel / operator wieży'
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
      subtitle: item.userNick ? `Użytkownik: ${item.userNick}` : undefined,
      diffs: diffs.length > 0 ? diffs : undefined,
      description: item.description,
      photoUrl: item.photoUrl,
      userNick: item.userNick
    });
  }

  // 2. Real Official UKE Permits & Revisions
  for (const p of ukeAnalysis.permits) {
    const byTech = new Map<string, string[]>();
    for (const b of p.bands) {
      const tech = (b.tech || 'LTE').toUpperCase();
      const list = byTech.get(tech) || [];
      list.push(b.band);
      byTech.set(tech, list);
    }

    const techOrder = ['5G', 'NR', 'LTE', 'UMTS', 'GSM', 'CDMA', 'IOT'];
    const sortedTechs = [...byTech.keys()].sort((a, b) => techOrder.indexOf(a) - techOrder.indexOf(b));

    const cellGroups: StationTimelineCellGroup[] = [];
    const techCounts: Array<{ tech: string; count: number }> = [];

    for (const tech of sortedTechs) {
      const bands = byTech.get(tech) || [];
      const sortedBands = [...bands].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
      cellGroups.push({
        tech,
        count: sortedBands.length,
        cells: sortedBands.map(band => ({
          label: `${tech} ${band} MHz`,
          paramLabel: 'Status',
          paramValue: 'Pozwolenie UKE'
        }))
      });
      techCounts.push({ tech, count: sortedBands.length });
    }

    const diffs: StationTimelineDiffItem[] = [];
    if (p.expires) {
      diffs.push({
        label: 'Ważność pozwolenia',
        newValue: p.expires.startsWith('2099') ? 'Bezterminowo' : p.expires
      });
    }

    const decisionYear = p.decisionYear || 2026;
    const createdAt = `${decisionYear}-01-01T12:00:00.000Z`;

    events.push({
      id: `uke-permit-${p.permitId}`,
      dateGroup: `${decisionYear}`,
      time: `UKE ${decisionYear} r.`,
      createdAt,
      kind: 'permit',
      title: p.kind || 'Decyzja radiowa UKE',
      subtitle: `Pozwolenie: ${p.permitId}${p.revision != null ? ` · Rewizja: nr ${p.revision}` : ''}`,
      totalCells: p.bands.length,
      techCounts,
      cellGroups,
      diffs: diffs.length > 0 ? diffs : undefined
    });
  }

  // 3. Real SI2PEM Environmental Measurement Reports
  for (const pem of pemTimeline) {
    const pemDate = pem.date || '2024-01-01';
    events.push({
      id: `pem-report-${pem.id || pem.number}`,
      dateGroup: pemDate,
      time: 'SI2PEM',
      createdAt: `${pemDate}T12:00:00.000Z`,
      kind: 'pem',
      title: 'Urzędowy pomiar PEM (SI2PEM)',
      subtitle: `Sprawozdanie nr: ${pem.number || 'Brak numeru'}${pem.laboratory ? ` · ${pem.laboratory}` : ''}`,
      downloadUrl: pem.downloadUrl
    });
  }

  // 4. Real Station Registration
  const rawCreatedAt = String(tower.createdAt || '');
  const regDate = rawCreatedAt ? rawCreatedAt.slice(0, 10) : '2026-10-10';
  const regTime = rawCreatedAt && rawCreatedAt.includes('T') ? rawCreatedAt.split('T')[1].slice(0, 5) : '00:00';

  events.push({
    id: `reg-${towerId}`,
    dateGroup: regDate,
    time: regTime,
    createdAt: rawCreatedAt || '2026-10-10T00:00:00.000Z',
    kind: 'created',
    title: isBtmap ? 'Zarejestrowano w społecznościowej bazie BTMap' : 'Rejestracja stacji w urzędowym wykazie UKE',
    subtitle: `Źródło: ${tower.source || 'UKE'}${tower.addedBy ? ` · ${tower.addedBy}` : ''}`
  });

  // Sort chronologically descending
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
      createdAt: String(tower.createdAt || '2026-10-10T00:00:00.000Z')
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

  const events = buildRealTimelineEvents(tower, btmapTimeline, ukeAnalysis, pemTimeline);
  const updatedAt = events[0]?.createdAt || String(tower.createdAt || '2026-10-10T00:00:00.000Z');

  return {
    towerId,
    stationId: String(tower.stationId || ''),
    address: String(tower.address || ''),
    source,
    isBtmap,
    createdAt: String(tower.createdAt || '2026-10-10T00:00:00.000Z'),
    updatedAt,
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
