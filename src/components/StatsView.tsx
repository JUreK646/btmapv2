import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Database,
  Info,
  Layers,
  MapPin,
  Radio,
  RadioTower,
  RefreshCw,
  Route,
  Ruler,
  Signal,
  Zap,
  X,
} from 'lucide-react';
import type { Health } from '../types';
import { api, formatNumber } from '../lib/api';
import { useI18n } from '../lib/i18n';
import '../stats.css';

export type StatsSection = 'uke' | 'radiolines' | 'btmap' | 'growth' | 'quality';

interface StatsGrowthOperatorBar {
  operator: string;
  total: number;
  newCount: number;
  newPercent: number;
}

interface StatsGrowthMetricCard {
  key: string;
  label: string;
  total: number;
  newTotal: number;
  operators: StatsGrowthOperatorBar[];
}

interface StatsGrowthBandCard {
  key: string;
  tech: string;
  band: string;
  duplex: 'FDD' | 'TDD';
  totalCells: number;
  newCells: number;
  totalStations: number;
  newStations: number;
  operatorCells: StatsGrowthOperatorBar[];
  operatorStations: StatsGrowthOperatorBar[];
}

interface StatsPeriodReport {
  id: string;
  title: string;
  dateRange: string;
  /** Registry date the report is compared with; null until a second registry has been synced. */
  comparedTo?: string | null;
  source: 'UKE' | 'BTMAP' | 'ALL';
  metrics: {
    stations: StatsGrowthMetricCard;
    cells: StatsGrowthMetricCard;
    cBand: StatsGrowthMetricCard;
    fourBandLte: StatsGrowthMetricCard;
    radiolines: StatsGrowthMetricCard;
    permits: StatsGrowthMetricCard;
  };
  bands: StatsGrowthBandCard[];
}

interface StatsTimelineItem {
  period: string;
  label: string;
  totalNew: number;
  operators: { operator: string; count: number }[];
  topBands: { band: string; count: number }[];
}

interface StatsComparisonBandItem {
  key: string;
  tech: string;
  band: string;
  ukeTotal: number;
  btmapTotal: number;
}

interface StatsOperatorItem {
  name: string;
  towers: number;
  permits: number;
  percent: number;
  permitPercent: number;
}

interface StatsTechItem {
  tech: string;
  towers: number;
  permits: number;
  percent: number;
  permitPercent: number;
}

interface StatsBandItem {
  key: string;
  tech: string;
  band: string;
  total: number;
  operators: { operator: string; count: number }[];
}

interface StatsProvinceItem {
  province: string;
  total: number;
  operators: { operator: string; count: number }[];
}

interface StatsRadiolineOperatorItem {
  name: string;
  group: string;
  links: number;
  percent: number;
  avgDistanceKm: number;
}

interface StatsRadiolineBandItem {
  band: string;
  rangeLabel: string;
  total: number;
  percent: number;
  avgDistanceKm: number;
  operators: { operator: string; count: number }[];
}

interface StatsRadiolineProvinceItem {
  province: string;
  total: number;
  operators: { operator: string; count: number }[];
}

interface StatsRadiolinesData {
  totalLinks: number;
  newLinks: number;
  avgDistanceKm: number;
  maxDistanceKm: number;
  totalLengthKm: number;
  updatedAt: string | null;
  operators: StatsRadiolineOperatorItem[];
  bands: StatsRadiolineBandItem[];
  provinces: StatsRadiolineProvinceItem[];
}

interface StatsDataQuality {
  totalTowers: number;
  ukeTowers: number;
  btmapTowers: number;
  withExplicitProvince: number;
  inferredProvince: number;
  withFullAddress: number;
  multiBandLteTowers: number;
  fourBandLteTowers: number;
  fiveGCBandTowers: number;
  fiveGDssTowers: number;
  collocatedTowers: number;
  pemPlansCount: number;
  pemCachedTowers: number;
  pemCachedReports: number;
  ukeWykazDate: string | null;
  radiolinesUpdatedAt: string | null;
}

interface TelecomStats {
  source: 'ALL' | 'BTMAP' | 'UKE';
  summary: {
    totalTowers: number;
    totalPermits: number;
    totalCells: number;
    ukeTowers: number;
    btmapTowers: number;
    latestNewTowers?: number;
    latestNewDate?: string | null;
  };
  technologies: StatsTechItem[];
  operators: StatsOperatorItem[];
  bands: StatsBandItem[];
  provinces: StatsProvinceItem[];
  timeline?: StatsTimelineItem[];
  monthlyReports?: StatsPeriodReport[];
  comparison?: {
    bands: StatsComparisonBandItem[];
  };
  radiolines: StatsRadiolinesData;
  dataQuality: StatsDataQuality;
  updatedAt: string;
}

/**
 * The four network operators, always in this order. The order is chosen so that neighbouring colours stay
 * distinguishable for colour-blind readers (checked with the dataviz palette validator: the brand pair
 * Plus green / T-Mobile pink is not, so they are never adjacent). Everyone else is folded into "Others".
 */
const PRIMARY_OPS = ['Plus', 'Orange', 'Play', 'T-Mobile'] as const;
const OP_COLORS: Record<string, string> = { Plus: '#10b981', Orange: '#f97316', Play: '#8b5cf6', 'T-Mobile': '#ec4899' };
const OTHERS_COLOR = 'var(--st-others)';
/** One series in a chart (technologies, radio link bands, shares) uses one colour for every bar. */
const SERIES_COLOR = 'var(--st-series)';

function primaryOperator(name: string): string | null {
  const n = (name || '').toLowerCase();
  if (n.includes('plus') || n.includes('polkomtel') || n.includes('towerlink')) return 'Plus';
  if (n.includes('orange')) return 'Orange';
  if (n.includes('play') || /\bp4\b/.test(n)) return 'Play';
  if (n.includes('t-mobile') || n.includes('tmobile')) return 'T-Mobile';
  return null;
}

const opColor = (name: string) => {
  const primary = primaryOperator(name);
  return primary ? OP_COLORS[primary] : OTHERS_COLOR;
};

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  detail?: string;
}

/** Sums counts per network operator in the fixed order, with every other licensee in one "Others" segment. */
function operatorSegments(parts: Array<{ operator: string; count: number }>, othersLabel: string): Segment[] {
  const sums = new Map<string, number>();
  const others = new Map<string, number>();
  for (const part of parts) {
    const primary = primaryOperator(part.operator);
    if (primary) sums.set(primary, (sums.get(primary) || 0) + part.count);
    else if (part.count > 0) others.set(part.operator, (others.get(part.operator) || 0) + part.count);
  }
  const segments: Segment[] = PRIMARY_OPS.map((op) => ({ key: op, label: op, value: sums.get(op) || 0, color: OP_COLORS[op] }));
  const otherTotal = [...others.values()].reduce((a, b) => a + b, 0);
  if (otherTotal > 0) {
    segments.push({
      key: '__others',
      label: othersLabel,
      value: otherTotal,
      color: OTHERS_COLOR,
      detail: [...others].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => `${name}: ${formatNumber(count)}`).join('\n'),
    });
  }
  return segments;
}

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const percentFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
function formatPct(value: number): string {
  if (value <= 0) return '0%';
  if (value < 0.1) return '<0,1%';
  return `${percentFormat.format(value)}%`;
}
const formatKm = (value: number) => `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: value < 100 ? 1 : 0 }).format(value)} km`;

export function StatsView({
  health,
  error: healthError,
  onRetry,
  section: externalSection,
  onSectionChange,
}: {
  health: Health | null;
  error: string;
  onRetry: () => void;
  section?: StatsSection;
  onSectionChange?: (s: StatsSection) => void;
}) {
  const { lang } = useI18n();
  const isPl = lang === 'pl';

  const [internalSection, setInternalSection] = useState<StatsSection>('uke');
  const activeSection = externalSection ?? internalSection;
  const setSection = (next: StatsSection) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };

  const [stats, setStats] = useState<TelecomStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [growthSource, setGrowthSource] = useState<'UKE' | 'BTMAP'>('UKE');
  const [growthPeriodIdx, setGrowthPeriodIdx] = useState<number>(0);
  const [growthBandMode, setGrowthBandMode] = useState<'cells' | 'stations'>('cells');
  const periodScrollRef = useRef<HTMLDivElement | null>(null);

  const handlePeriodWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (periodScrollRef.current) {
      periodScrollRef.current.scrollLeft += e.deltaY || e.deltaX;
    }
  };

  const apiSource = activeSection === 'growth' ? growthSource : (activeSection === 'btmap' ? 'BTMAP' : 'UKE');

  const statsCacheRef = useRef<Record<string, TelecomStats>>({});

  const fetchStats = useCallback((src: 'UKE' | 'BTMAP') => {
    if (statsCacheRef.current[src]) {
      setStats(statsCacheRef.current[src]);
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }

    api<TelecomStats>(`/stats?source=${src}`)
      .then((data) => {
        statsCacheRef.current[src] = data;
        setStats(data);
      })
      .catch((e) => {
        if (!statsCacheRef.current[src]) {
          setError(e.message || (isPl ? 'Nie udało się pobrać statystyk.' : 'Failed to load statistics.'));
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isPl]);

  useEffect(() => {
    fetchStats(apiSource);
    const otherSource: 'UKE' | 'BTMAP' = apiSource === 'UKE' ? 'BTMAP' : 'UKE';
    if (!statsCacheRef.current[otherSource]) {
      api<TelecomStats>(`/stats?source=${otherSource}`)
        .then((data) => {
          statsCacheRef.current[otherSource] = data;
        })
        .catch(() => {});
    }
  }, [apiSource, fetchStats]);

  const othersLabel = isPl ? 'Pozostali' : 'Others';

  const filteredBands = useMemo(() => {
    if (!stats) return [];
    return stats.bands.filter((b) => {
      if (b.total <= 0) return false;
      if (techFilter === 'ALL') return true;
      if (techFilter === 'OTHER') return !['5G', 'LTE', 'UMTS', 'GSM'].includes(b.tech);
      return b.tech === techFilter;
    });
  }, [stats, techFilter]);

  const exportCsv = () => {
    if (!stats) return;
    const rows: string[][] = [];

    if (activeSection === 'radiolines') {
      rows.push(['Kategoria', 'Pozycja', 'Liczba linii', 'Udział (%)', 'Średni dystans (km)']);
      for (const op of stats.radiolines.operators) {
        rows.push(['Operator', op.name, String(op.links), String(op.percent), String(op.avgDistanceKm)]);
      }
      for (const b of stats.radiolines.bands) {
        rows.push(['Pasmo', b.band, String(b.total), String(b.percent), String(b.avgDistanceKm)]);
      }
      for (const p of stats.radiolines.provinces) {
        rows.push(['Województwo', p.province, String(p.total), '', '']);
      }
    } else {
      rows.push(['Kategoria', 'Nazwa', 'Stacje', 'Pozwolenia / Komórki', 'Penetracja stacji (%)', 'Udział pozwoleń (%)']);
      rows.push(['Podsumowanie', 'Lokalizacje ogółem', String(stats.summary.totalTowers), String(stats.summary.totalPermits), '100', '100']);
      for (const op of stats.operators) {
        rows.push(['Operator', op.name, String(op.towers), String(op.permits), String(op.percent), String(op.permitPercent)]);
      }
      for (const t of stats.technologies) {
        rows.push(['Technologia', t.tech, String(t.towers), String(t.permits), String(t.percent), String(t.permitPercent)]);
      }
      for (const b of stats.bands) {
        rows.push(['Pasmo', b.key, String(b.total), '', '', '']);
      }
      for (const p of stats.provinces) {
        rows.push(['Województwo', p.province, String(p.total), '', '', '']);
      }
    }

    const escape = (v: string) => '"' + String(v ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""') + '"';
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(escape).join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `btmap-statystyki-${activeSection}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error || healthError) {
    return (
      <section className="gr-view st-view">
        <div className="empty-state spacious">
          <Activity size={36} />
          <h2>{isPl ? 'Statystyki są chwilowo niedostępne' : 'Statistics are temporarily unavailable'}</h2>
          <p>{error || healthError}</p>
          <button
            className="secondary-button"
            onClick={() => {
              onRetry();
              fetchStats(apiSource);
            }}
          >
            {isPl ? 'Spróbuj ponownie' : 'Try again'}
          </button>
        </div>
      </section>
    );
  }

  if (activeSection === 'growth') {
    const reports = stats?.monthlyReports || [];
    const safeIdx = Math.min(Math.max(0, growthPeriodIdx), Math.max(0, reports.length - 1));
    const activeReport = reports[safeIdx];
    const hasComparison = Boolean(activeReport?.comparedTo);
    const bandUnit = growthBandMode === 'cells' ? (isPl ? 'sektorów' : 'sectors') : (isPl ? 'stacji' : 'sites');

    type BarRow = { key: string; label: string; total: number; newCount: number; color: string; detail?: string };

    // The four network operators always appear in the same order so cards can be compared at a glance;
    // everyone else is summed into one "Others" row instead of a column per tiny licensee.
    const toRows = (list: StatsGrowthOperatorBar[]): BarRow[] => {
      const rows: BarRow[] = PRIMARY_OPS.map((name) => {
        const found = list.find((o) => o.operator === name);
        return { key: name, label: name, total: found?.total ?? 0, newCount: found?.newCount ?? 0, color: OP_COLORS[name] };
      });
      const others = list.filter((o) => !(PRIMARY_OPS as readonly string[]).includes(o.operator) && o.total > 0).sort((a, b) => b.total - a.total);
      if (others.length) {
        rows.push({
          key: '__others',
          label: isPl ? 'Pozostali' : 'Others',
          total: others.reduce((sum, o) => sum + o.total, 0),
          newCount: others.reduce((sum, o) => sum + o.newCount, 0),
          color: OTHERS_COLOR,
          detail: others.map((o) => `${o.operator}: ${formatNumber(o.total)}`).join('\n'),
        });
      }
      return rows;
    };

    const renderBars = (rows: BarRow[], unit: string) => {
      const max = Math.max(...rows.map((r) => r.total), 1);
      return (
        <ul className={`gr-bars ${hasComparison ? 'has-new' : ''}`}>
          {rows.map((r) => (
            <li
              key={r.key}
              className={`gr-bar-row ${r.total === 0 ? 'is-empty' : ''}`}
              title={`${r.label}: ${formatNumber(r.total)} ${unit}${r.newCount > 0 ? ` (+${formatNumber(r.newCount)})` : ''}${r.detail ? `\n\n${r.detail}` : ''}`}
            >
              <span className="gr-bar-name">
                <i style={{ background: r.color }} aria-hidden="true" />
                {r.label}
              </span>
              <span className="gr-bar-track" aria-hidden="true">
                <span className="gr-bar-fill" style={{ width: `${(r.total / max) * 100}%`, background: r.color }} />
              </span>
              <span className="gr-bar-value">{r.total > 0 ? formatNumber(r.total) : '—'}</span>
              {hasComparison && <span className="gr-bar-new">{r.newCount > 0 ? `+${formatNumber(r.newCount)}` : ''}</span>}
            </li>
          ))}
        </ul>
      );
    };

    const metricCard = (m: StatsGrowthMetricCard, icon: React.ReactNode, unit: string) => (
      <article className="gr-card" key={m.key}>
        <header className="gr-card-head">
          <span className="gr-card-icon" aria-hidden="true">{icon}</span>
          <h3>{m.label}</h3>
          {hasComparison && (
            <span className={`gr-chip ${m.newTotal > 0 ? 'is-up' : ''}`}>
              {m.newTotal > 0 ? `+${formatNumber(m.newTotal)}` : isPl ? 'bez zmian' : 'no change'}
            </span>
          )}
        </header>
        <div className="gr-card-total">
          <strong>{formatNumber(m.total)}</strong>
          <span>{unit}</span>
        </div>
        {renderBars(toRows(m.operators), unit)}
      </article>
    );

    const segmented = <T extends string>(value: T, options: Array<{ value: T; label: string; icon: React.ReactNode }>, onChange: (next: T) => void, label: string) => (
      <div className="gr-segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" className={value === o.value ? 'is-active' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.icon}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    );

    return (
      <section className="gr-view" key="growth">
        <header className="gr-header">
          <div className="gr-heading">
            <h1>{isPl ? 'Przyrost w wykazach' : 'Registry growth'}</h1>
            <p className="gr-meta">
              <span>{growthSource === 'UKE' ? (isPl ? 'Rejestr UKE' : 'UKE registry') : (isPl ? 'Baza BTMap' : 'BTMap database')}</span>
              {activeReport && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{activeReport.title}</span>
                </>
              )}
              {hasComparison && activeReport && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{activeReport.dateRange}</span>
                </>
              )}
            </p>
          </div>
          <div className="gr-actions">
            {segmented(
              growthSource,
              [
                { value: 'UKE' as const, label: isPl ? 'Rejestr UKE' : 'UKE registry', icon: <Database size={13} /> },
                { value: 'BTMAP' as const, label: isPl ? 'Baza BTMap' : 'BTMap', icon: <Radio size={13} /> },
              ],
              (next) => {
                if (next !== growthSource) {
                  setGrowthPeriodIdx(0);
                  setGrowthSource(next);
                }
              },
              isPl ? 'Źródło danych' : 'Data source'
            )}
            <button type="button" className="gr-icon-btn" onClick={() => setSection('uke')} aria-label={isPl ? 'Zamknij' : 'Close'} title={isPl ? 'Wróć do statystyk' : 'Back to statistics'}>
              <X size={16} />
            </button>
          </div>
        </header>

        {activeReport && !hasComparison && (
          <div className="gr-notice" role="note">
            <Info size={16} aria-hidden="true" />
            <span>
              {isPl
                ? 'To pierwszy zapisany wykaz, więc nie ma jeszcze z czym porównać. Przyrost pojawi się po następnej synchronizacji wykazu UKE – poniżej stan bieżący.'
                : 'This is the first saved registry, so there is nothing to compare with yet. Growth appears after the next UKE sync – the current state is shown below.'}
            </span>
          </div>
        )}

        {reports.length > 1 && (
          <nav className="gr-periods" aria-label={isPl ? 'Wykazy' : 'Registries'}>
            <button type="button" className="gr-icon-btn is-small" disabled={safeIdx <= 0} onClick={() => setGrowthPeriodIdx((prev) => Math.max(0, prev - 1))} aria-label={isPl ? 'Nowszy wykaz' : 'Newer registry'}>
              <ChevronLeft size={15} />
            </button>
            <div ref={periodScrollRef} className="gr-period-track" onWheel={handlePeriodWheel}>
              {reports.map((rep, idx) => (
                <button key={rep.id} type="button" className={`gr-period ${idx === safeIdx ? 'is-active' : ''}`} aria-current={idx === safeIdx ? 'true' : undefined} onClick={() => setGrowthPeriodIdx(idx)}>
                  {rep.title}
                </button>
              ))}
            </div>
            <button type="button" className="gr-icon-btn is-small" disabled={safeIdx >= reports.length - 1} onClick={() => setGrowthPeriodIdx((prev) => Math.min(reports.length - 1, prev + 1))} aria-label={isPl ? 'Starszy wykaz' : 'Older registry'}>
              <ChevronRight size={15} />
            </button>
          </nav>
        )}

        {loading && !stats ? (
          <div className="gr-loading">
            <RefreshCw className="spin" size={20} />
            <span>{isPl ? 'Wczytywanie…' : 'Loading…'}</span>
          </div>
        ) : activeReport ? (
          <>
            <section className="gr-section">
              <div className="gr-section-head">
                <h2>{isPl ? 'Podsumowanie' : 'Summary'}</h2>
              </div>
              <div className="gr-metric-grid">
                {metricCard(activeReport.metrics.stations, <RadioTower size={16} />, isPl ? 'stacji' : 'sites')}
                {metricCard({ ...activeReport.metrics.cells, label: isPl ? 'Sektory' : 'Sectors' }, <Layers size={16} />, isPl ? 'sektorów' : 'sectors')}
                {metricCard(activeReport.metrics.cBand, <Zap size={16} />, isPl ? 'stacji n78' : 'n78 sites')}
                {metricCard(activeReport.metrics.radiolines, <Signal size={16} />, isPl ? 'linii' : 'links')}
                {metricCard(activeReport.metrics.permits, <Database size={16} />, isPl ? 'pozwoleń' : 'permits')}
              </div>
            </section>

            <section className="gr-section">
              <div className="gr-section-head">
                <div>
                  <h2>{isPl ? 'Pasma' : 'Bands'}</h2>
                  <p>{growthBandMode === 'cells' ? (isPl ? 'Liczba sektorów w każdym paśmie' : 'Sectors per band') : (isPl ? 'Liczba stacji nadających w każdym paśmie' : 'Sites transmitting in each band')}</p>
                </div>
                {segmented(
                  growthBandMode,
                  [
                    { value: 'cells' as const, label: isPl ? 'Sektory' : 'Sectors', icon: <Layers size={13} /> },
                    { value: 'stations' as const, label: isPl ? 'Stacje' : 'Sites', icon: <RadioTower size={13} /> },
                  ],
                  setGrowthBandMode,
                  isPl ? 'Widok pasm' : 'Band view'
                )}
              </div>
              <div className="gr-band-grid">
                {activeReport.bands.map((b) => {
                  const list = growthBandMode === 'cells' ? b.operatorCells : b.operatorStations;
                  const total = growthBandMode === 'cells' ? b.totalCells : b.totalStations;
                  const fresh = growthBandMode === 'cells' ? b.newCells : b.newStations;
                  const tech = b.tech === '5G' ? 'NR' : b.tech;
                  return (
                    <article key={b.key} className={`gr-card gr-band ${total === 0 ? 'is-empty' : ''}`}>
                      <header className="gr-card-head">
                        <span className="gr-tech" data-tech={tech}>{tech}</span>
                        <h3>
                          {b.band} <small>MHz</small>
                        </h3>
                        {b.duplex === 'TDD' && <span className="gr-duplex">TDD</span>}
                        {hasComparison && fresh > 0 && <span className="gr-chip is-up">+{formatNumber(fresh)}</span>}
                      </header>
                      {total === 0 ? (
                        <p className="gr-empty">{isPl ? 'Brak w wykazie' : 'Not in the registry'}</p>
                      ) : (
                        <>
                          <div className="gr-card-total">
                            <strong>{formatNumber(total)}</strong>
                            <span>{bandUnit}</span>
                          </div>
                          {renderBars(toRows(list), bandUnit)}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Shared building blocks for the registry, radio link, BTMap and quality views
  // ---------------------------------------------------------------------------
  const tile = (label: string, value: string, sub?: string, icon?: ReactNode) => (
    <article className="st-tile" key={label}>
      <div className="st-tile-head">
        <span>{label}</span>
        {icon && <span className="st-tile-icon" aria-hidden="true">{icon}</span>}
      </div>
      <strong className="st-tile-value">{value}</strong>
      {sub && <span className="st-tile-sub">{sub}</span>}
    </article>
  );

  const card = (title: string, subtitle: string | null, body: ReactNode, opts: { wide?: boolean; actions?: ReactNode; key?: string } = {}) => (
    <article className={`gr-card st-card ${opts.wide ? 'is-wide' : ''}`} key={opts.key ?? title}>
      <header className="st-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {opts.actions}
      </header>
      {body}
    </article>
  );

  const dotLabel = (label: string, color: string) => (
    <>
      <i className="st-dot" style={{ background: color }} aria-hidden="true" />
      <span>{label}</span>
    </>
  );

  type RankRow = { key: string; name: string; label: ReactNode; value: number; color: string; note?: string; detail?: string };

  /**
   * Ranked horizontal bars. With `whole` the track stands for that total (a share meter);
   * otherwise bars are scaled to the largest row.
   */
  const ranked = (rows: RankRow[], unit: string, whole?: number) => {
    const scale = whole && whole > 0 ? whole : Math.max(...rows.map((r) => r.value), 1);
    return (
      <ul className="st-rank">
        {rows.map((r) => (
          <li key={r.key} className="st-rank-row" title={`${r.name}: ${formatNumber(r.value)} ${unit}${r.note ? ` · ${r.note}` : ''}${r.detail ? `\n\n${r.detail}` : ''}`}>
            <span className="st-rank-label">{r.label}</span>
            <span className="st-rank-track" aria-hidden="true">
              <span className="st-rank-fill" style={{ width: `${Math.min(100, (r.value / scale) * 100)}%`, background: r.color }} />
            </span>
            <span className="st-rank-value">{formatNumber(r.value)}</span>
            <span className="st-rank-note">{r.note ?? ''}</span>
          </li>
        ))}
      </ul>
    );
  };

  const legend = (segments: Segment[]) => (
    <ul className="st-legend" aria-label={isPl ? 'Legenda' : 'Legend'}>
      {segments.map((s) => (
        <li key={s.key}>
          <i style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );

  type StackRow = { key: string; name: string; label: ReactNode; total: number; segments: Segment[] };

  /** One segmented bar per row: length = row total (scaled to the largest row), parts = operators in fixed order. */
  const stacked = (rows: StackRow[], unit: string) => {
    const max = Math.max(...rows.map((r) => r.total), 1);
    return (
      <ul className="st-stack">
        {rows.map((r) => {
          const parts = r.segments.filter((s) => s.value > 0);
          const partsTotal = parts.reduce((sum, s) => sum + s.value, 0) || 1;
          return (
            <li
              key={r.key}
              className="st-stack-row"
              title={[`${r.name}: ${formatNumber(r.total)} ${unit}`, ...parts.map((s) => `${s.label}: ${formatNumber(s.value)} (${formatPct(share(s.value, partsTotal))})`)].join('\n')}
            >
              <span className="st-stack-label">{r.label}</span>
              <span className="st-stack-track" aria-hidden="true">
                <span className="st-stack-bar" style={{ width: `${(r.total / max) * 100}%` }}>
                  {parts
                    .filter((s) => share(s.value, partsTotal) >= 0.5)
                    .map((s) => (
                      <span key={s.key} style={{ flexGrow: s.value, background: s.color }} />
                    ))}
                </span>
              </span>
              <span className="st-stack-value">{formatNumber(r.total)}</span>
            </li>
          );
        })}
      </ul>
    );
  };

  const legendSegments = operatorSegments([], othersLabel).concat([{ key: '__others', label: othersLabel, value: 0, color: OTHERS_COLOR }]);

  const segmentedControl = <T extends string>(value: T, options: Array<{ value: T; label: string }>, onChange: (next: T) => void, label: string) => (
    <div className="gr-segmented st-filter" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'is-active' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );

  const titles: Record<Exclude<StatsSection, 'growth'>, { pl: string; en: string }> = {
    uke: { pl: 'Rejestr UKE', en: 'UKE registry' },
    radiolines: { pl: 'Radiolinie UKE', en: 'UKE radio links' },
    btmap: { pl: 'Baza BTMap', en: 'BTMap database' },
    quality: { pl: 'Jakość danych', en: 'Data quality' },
  };
  const section = activeSection as Exclude<StatsSection, 'growth'>;
  const dq = stats?.dataQuality;
  const metaLine =
    section === 'uke'
      ? dq?.ukeWykazDate ? (isPl ? `Wykaz pozwoleń radiowych · stan na ${dq.ukeWykazDate}` : `Radio permit registry · as of ${dq.ukeWykazDate}`) : (isPl ? 'Wykaz pozwoleń radiowych' : 'Radio permit registry')
      : section === 'radiolines'
      ? dq?.radiolinesUpdatedAt ? (isPl ? `Pozwolenia na linie radiowe · aktualizacja ${dq.radiolinesUpdatedAt.slice(0, 10)}` : `Radio link permits · updated ${dq.radiolinesUpdatedAt.slice(0, 10)}`) : (isPl ? 'Pozwolenia na linie radiowe' : 'Radio link permits')
      : section === 'btmap'
      ? (isPl ? 'Stacje zgłoszone i zweryfikowane przez społeczność' : 'Stations submitted and verified by the community')
      : (isPl ? 'Kompletność danych i stan źródeł' : 'Completeness and source status');

  // ---------------------------------------------------------------------------
  // Registry / BTMap view
  // ---------------------------------------------------------------------------
  const renderStations = (s: TelecomStats) => {
    const isBtmap = section === 'btmap';
    const total = s.summary.totalTowers;
    if (isBtmap && total === 0) {
      return (
        <div className="gr-notice" role="note">
          <Info size={16} aria-hidden="true" />
          <span>
            {isPl
              ? `Baza BTMap nie ma jeszcze zatwierdzonych stacji. W rejestrze UKE jest ${formatNumber(s.summary.ukeTowers)} lokalizacji – stacje możesz dodawać z widoku mapy.`
              : `The BTMap database has no approved stations yet. The UKE registry holds ${formatNumber(s.summary.ukeTowers)} locations – add stations from the map.`}
          </span>
        </div>
      );
    }
    const nr = s.technologies.find((t) => t.tech === '5G');
    const opSegments = operatorSegments(s.operators.map((o) => ({ operator: o.name, count: o.towers })), othersLabel).filter((x) => x.value > 0);
    const techNames: Record<string, string> = { '5G': '5G NR', LTE: 'LTE', UMTS: 'UMTS', GSM: 'GSM', 'GSM-R': 'GSM-R', IOT: 'IoT', CDMA: 'CDMA' };
    const unitStations = isPl ? 'stacji' : 'sites';
    const bandTech = (tech: string) => (tech === '5G' ? 'NR' : tech);
    return (
      <>
        <div className="st-tiles">
          {tile(isBtmap ? (isPl ? 'Stacje w bazie' : 'Stations') : (isPl ? 'Lokalizacje w rejestrze' : 'Registry locations'), formatNumber(total), isBtmap ? (isPl ? 'zatwierdzone stacje BTMap' : 'approved BTMap stations') : (isPl ? 'unikalne lokalizacje stacji' : 'unique station locations'), <RadioTower size={16} />)}
          {isBtmap
            ? tile(isPl ? 'Sektory' : 'Sectors', formatNumber(s.summary.totalCells), isPl ? 'z danymi komórek' : 'with cell data', <Layers size={16} />)
            : tile(isPl ? 'Pozwolenia radiowe' : 'Radio permits', formatNumber(s.summary.totalPermits), total > 0 ? (isPl ? `średnio ${percentFormat.format(s.summary.totalPermits / total)} na lokalizację` : `${percentFormat.format(s.summary.totalPermits / total)} per location on average`) : undefined, <Layers size={16} />)}
          {tile(isPl ? 'Stacje 5G NR' : '5G NR sites', formatNumber(nr?.towers ?? 0), isPl ? `${formatPct(share(nr?.towers ?? 0, total))} wszystkich stacji` : `${formatPct(share(nr?.towers ?? 0, total))} of all sites`, <Signal size={16} />)}
          {tile(isPl ? 'Stacje 5G C-Band' : '5G C-Band sites', formatNumber(s.dataQuality.fiveGCBandTowers), isPl ? `pasmo n78 · ${formatPct(share(s.dataQuality.fiveGCBandTowers, total))} stacji` : `n78 · ${formatPct(share(s.dataQuality.fiveGCBandTowers, total))} of sites`, <Zap size={16} />)}
        </div>

        <div className="st-grid">
          {card(
            isPl ? 'Operatorzy' : 'Operators',
            isPl ? 'Liczba stacji każdego operatora i udział we wszystkich stacjach' : 'Sites per operator and share of all sites',
            ranked(
              opSegments.map((x) => ({ key: x.key, name: x.label, label: dotLabel(x.label, x.color), value: x.value, color: x.color, note: formatPct(share(x.value, total)), detail: x.detail })),
              unitStations
            )
          )}
          {card(
            isPl ? 'Technologie' : 'Technologies',
            isPl ? 'Stacje z co najmniej jednym pasmem danej technologii' : 'Sites with at least one band of the technology',
            ranked(
              [...s.technologies].filter((t) => t.towers > 0).sort((a, b) => b.towers - a.towers).map((t) => ({ key: t.tech, name: techNames[t.tech] || t.tech, label: <span>{techNames[t.tech] || t.tech}</span>, value: t.towers, color: SERIES_COLOR, note: formatPct(t.percent) })),
              unitStations
            )
          )}
          {card(
            isPl ? 'Pasma' : 'Bands',
            isPl ? 'Stacje nadające w każdym paśmie, z podziałem na operatorów' : 'Sites transmitting in each band, split by operator',
            <>
              {legend(legendSegments)}
              {filteredBands.length ? (
                stacked(
                  filteredBands.map((b) => ({
                    key: b.key,
                    name: `${b.tech} ${b.band} MHz`,
                    label: (
                      <>
                        <span className="gr-tech" data-tech={bandTech(b.tech)}>{bandTech(b.tech)}</span>
                        <span>{b.band} <small>MHz</small></span>
                      </>
                    ),
                    total: b.total,
                    segments: operatorSegments(b.operators, othersLabel),
                  })),
                  unitStations
                )
              ) : (
                <p className="gr-empty">{isPl ? 'Brak pasm dla wybranej technologii.' : 'No bands for the selected technology.'}</p>
              )}
            </>,
            {
              wide: true,
              actions: segmentedControl(
                techFilter,
                [
                  { value: 'ALL', label: isPl ? 'Wszystkie' : 'All' },
                  { value: '5G', label: '5G' },
                  { value: 'LTE', label: 'LTE' },
                  { value: 'UMTS', label: 'UMTS' },
                  { value: 'GSM', label: 'GSM' },
                  { value: 'OTHER', label: isPl ? 'Inne' : 'Other' },
                ],
                setTechFilter,
                isPl ? 'Technologia' : 'Technology'
              ),
            }
          )}
          {card(
            isPl ? 'Województwa' : 'Provinces',
            isPl ? 'Stacje w każdym województwie, z podziałem na operatorów' : 'Sites per province, split by operator',
            <>
              {legend(legendSegments)}
              {stacked(
                s.provinces.filter((p) => p.total > 0).map((p) => ({ key: p.province, name: p.province, label: <span>{p.province}</span>, total: p.total, segments: operatorSegments(p.operators, othersLabel) })),
                unitStations
              )}
            </>,
            { wide: true }
          )}
          {isBtmap && s.comparison && s.comparison.bands.length > 0 &&
            card(
              isPl ? 'Pasma: rejestr UKE a baza BTMap' : 'Bands: UKE registry vs BTMap',
              isPl ? 'Liczba wpisów pasma w obu źródłach' : 'Band entries in both sources',
              <div className="st-table-wrap">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th scope="col">{isPl ? 'Pasmo' : 'Band'}</th>
                      <th scope="col" className="is-num">{isPl ? 'Rejestr UKE' : 'UKE registry'}</th>
                      <th scope="col" className="is-num">BTMap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.comparison.bands.map((cb) => (
                      <tr key={cb.key}>
                        <td>{cb.tech} {cb.band} MHz</td>
                        <td className="is-num">{formatNumber(cb.ukeTotal)}</td>
                        <td className="is-num">{formatNumber(cb.btmapTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
              { wide: true }
            )}
        </div>
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Radio link view
  // ---------------------------------------------------------------------------
  const renderRadiolines = (s: TelecomStats) => {
    const rl = s.radiolines;
    const unitLinks = isPl ? 'linii' : 'links';
    return (
      <>
        <div className="st-tiles">
          {tile(isPl ? 'Linie radiowe' : 'Radio links', formatNumber(rl.totalLinks), rl.newLinks > 0 ? (isPl ? `${formatNumber(rl.newLinks)} nowych w ostatnim wykazie` : `${formatNumber(rl.newLinks)} new in the latest registry`) : undefined, <Radio size={16} />)}
          {tile(isPl ? 'Łączna długość' : 'Total length', formatKm(rl.totalLengthKm), isPl ? 'suma długości wszystkich przęseł' : 'sum of all hops', <Route size={16} />)}
          {tile(isPl ? 'Średnia długość' : 'Average length', formatKm(rl.avgDistanceKm), isPl ? 'jednego przęsła' : 'per hop', <Ruler size={16} />)}
          {tile(isPl ? 'Najdłuższe przęsło' : 'Longest hop', formatKm(rl.maxDistanceKm), undefined, <MapPin size={16} />)}
        </div>
        <div className="st-grid">
          {card(
            isPl ? 'Operatorzy' : 'Operators',
            isPl ? 'Liczba linii i średnia długość przęsła' : 'Links and average hop length',
            ranked(
              rl.operators.map((o) => ({ key: o.name, name: o.name, label: dotLabel(o.name, opColor(o.group)), value: o.links, color: opColor(o.group), note: `${formatPct(o.percent)} · ${formatKm(o.avgDistanceKm)}` })),
              unitLinks
            )
          )}
          {card(
            isPl ? 'Pasma częstotliwości' : 'Frequency bands',
            isPl ? 'Liczba linii i średnia długość przęsła w paśmie' : 'Links and average hop length per band',
            ranked(
              rl.bands.map((b) => ({ key: b.band, name: `${b.band} (${b.rangeLabel})`, label: <span>{b.band}</span>, value: b.total, color: SERIES_COLOR, note: b.total > 0 && b.avgDistanceKm > 0 ? `${formatPct(b.percent)} · ${formatKm(b.avgDistanceKm)}` : formatPct(b.percent) })),
              unitLinks
            )
          )}
          {card(
            isPl ? 'Województwa' : 'Provinces',
            isPl ? 'Linie w każdym województwie (wg nadajnika), z podziałem na operatorów' : 'Links per province (by transmitter), split by operator',
            <>
              {legend(legendSegments)}
              {stacked(
                rl.provinces.filter((p) => p.total > 0).map((p) => ({ key: p.province, name: p.province, label: <span>{p.province}</span>, total: p.total, segments: operatorSegments(p.operators, othersLabel) })),
                unitLinks
              )}
            </>,
            { wide: true }
          )}
        </div>
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Data quality view
  // ---------------------------------------------------------------------------
  const renderQuality = (s: TelecomStats) => {
    const q = s.dataQuality;
    const total = q.totalTowers;
    const unitStations = isPl ? 'stacji' : 'sites';
    const sources = [
      { key: 'uke', name: isPl ? 'Wykaz stacji bazowych UKE' : 'UKE base station registry', detail: isPl ? 'pozwolenia GSM / UMTS / LTE / 5G' : 'GSM / UMTS / LTE / 5G permits', records: `${formatNumber(q.ukeTowers)} ${unitStations} · ${formatNumber(s.summary.totalPermits)} ${isPl ? 'pozwoleń' : 'permits'}`, state: q.ukeWykazDate || '—' },
      { key: 'rl', name: isPl ? 'Wykaz linii radiowych UKE' : 'UKE radio link registry', detail: isPl ? 'przęsła punkt–punkt 7–86 GHz' : 'point-to-point hops, 7–86 GHz', records: `${formatNumber(s.radiolines.totalLinks)} ${isPl ? 'linii' : 'links'}`, state: q.radiolinesUpdatedAt ? q.radiolinesUpdatedAt.slice(0, 10) : '—' },
      { key: 'pem', name: 'SI2PEM', detail: isPl ? 'harmonogram i sprawozdania z pomiarów PEM' : 'EMF measurement schedule and reports', records: `${formatNumber(q.pemPlansCount)} ${isPl ? 'pomiarów w harmonogramie' : 'scheduled'} · ${formatNumber(q.pemCachedReports)} ${isPl ? 'raportów' : 'reports'}`, state: isPl ? 'na bieżąco z API' : 'live API' },
      { key: 'btmap', name: isPl ? 'Baza BTMap' : 'BTMap database', detail: isPl ? 'zgłoszenia społeczności' : 'community submissions', records: `${formatNumber(q.btmapTowers)} ${unitStations}`, state: health ? (isPl ? 'połączona' : 'connected') : '—' },
    ];
    return (
      <>
        <div className="st-tiles">
          {tile(isPl ? 'Pełny adres' : 'Full address', formatPct(share(q.withFullAddress, total)), isPl ? `${formatNumber(q.withFullAddress)} z ${formatNumber(total)} stacji` : `${formatNumber(q.withFullAddress)} of ${formatNumber(total)} sites`, <MapPin size={16} />)}
          {tile(isPl ? 'Województwo z rejestru' : 'Province from registry', formatPct(share(q.withExplicitProvince, total)), isPl ? `${formatNumber(q.inferredProvince)} ustalonych ze współrzędnych` : `${formatNumber(q.inferredProvince)} inferred from coordinates`, <Database size={16} />)}
          {tile(isPl ? 'Pomiary PEM w harmonogramie' : 'Scheduled EMF measurements', formatNumber(q.pemPlansCount), 'SI2PEM', <Activity size={16} />)}
          {tile(isPl ? 'Zapisane raporty PEM' : 'Saved EMF reports', formatNumber(q.pemCachedReports), isPl ? `dla ${formatNumber(q.pemCachedTowers)} stacji` : `for ${formatNumber(q.pemCachedTowers)} sites`, <Signal size={16} />)}
        </div>
        <div className="st-grid">
          {card(
            isPl ? '5G i współdzielenie masztów' : '5G and shared masts',
            isPl ? 'Odsetek wszystkich stacji spełniających warunek' : 'Share of all sites meeting the condition',
            ranked(
              [
                { key: 'dss', name: isPl ? '5G w pasmach FDD (DSS)' : '5G in FDD bands (DSS)', value: q.fiveGDssTowers },
                { key: 'cband', name: isPl ? '5G C-Band (n78)' : '5G C-Band (n78)', value: q.fiveGCBandTowers },
                { key: 'shared', name: isPl ? 'Maszt z ≥2 operatorami' : 'Mast with ≥2 operators', value: q.collocatedTowers },
              ].map((r) => ({ ...r, label: <span>{r.name}</span>, color: SERIES_COLOR, note: formatPct(share(r.value, total)) })),
              unitStations,
              total
            )
          )}
          {card(
            isPl ? 'Źródła danych' : 'Data sources',
            isPl ? 'Liczba rekordów i stan każdego źródła' : 'Records and status of each source',
            <div className="st-table-wrap">
              <table className="st-table">
                <thead>
                  <tr>
                    <th scope="col">{isPl ? 'Źródło' : 'Source'}</th>
                    <th scope="col">{isPl ? 'Rekordy' : 'Records'}</th>
                    <th scope="col">{isPl ? 'Stan' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((src) => (
                    <tr key={src.key}>
                      <td>
                        <strong>{src.name}</strong>
                        <small>{src.detail}</small>
                      </td>
                      <td>{src.records}</td>
                      <td>{src.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  };

  const title = titles[section] ?? titles.uke;
  return (
    // Keyed by section so switching sections starts at the top instead of keeping the previous scroll position.
    <section className="gr-view st-view" key={section}>
      <header className="gr-header">
        <div className="gr-heading">
          <h1>{isPl ? title.pl : title.en}</h1>
          <p className="gr-meta">
            <span>{metaLine}</span>
          </p>
        </div>
        <div className="gr-actions">
          <button type="button" className="st-btn" onClick={exportCsv} disabled={!stats || loading} title={isPl ? 'Pobierz dane tego widoku jako CSV' : 'Download this view as CSV'}>
            <ArrowDownToLine size={15} />
            <span>CSV</span>
          </button>
          <button type="button" className="gr-icon-btn" onClick={() => fetchStats(apiSource)} disabled={loading} aria-label={isPl ? 'Odśwież dane' : 'Refresh data'} title={isPl ? 'Odśwież dane' : 'Refresh data'}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {loading && !stats ? (
        <div className="gr-loading">
          <RefreshCw className="spin" size={20} />
          <span>{isPl ? 'Wczytywanie…' : 'Loading…'}</span>
        </div>
      ) : stats ? (
        <>
          {(section === 'uke' || section === 'btmap') && renderStations(stats)}
          {section === 'radiolines' && renderRadiolines(stats)}
          {section === 'quality' && renderQuality(stats)}
          <p className="st-footnote">
            {isPl
              ? `Dane z bazy aplikacji: ${formatNumber(stats.summary.ukeTowers)} lokalizacji UKE (${formatNumber(stats.summary.totalPermits)} pozwoleń), ${formatNumber(stats.radiolines.totalLinks)} linii radiowych i ${formatNumber(stats.summary.btmapTowers)} stacji BTMap.`
              : `From the app database: ${formatNumber(stats.summary.ukeTowers)} UKE locations (${formatNumber(stats.summary.totalPermits)} permits), ${formatNumber(stats.radiolines.totalLinks)} radio links and ${formatNumber(stats.summary.btmapTowers)} BTMap stations.`}
          </p>
        </>
      ) : null}
    </section>
  );
}
