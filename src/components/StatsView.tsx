import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  MapPin,
  Radio,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Signal,
  Sparkles,
} from 'lucide-react';
import type { Health } from '../types';
import { api, formatNumber } from '../lib/api';
import { operatorColor } from '../lib/constants';
import { useI18n } from '../lib/i18n';
import '../stats.css';

export type StatsSection = 'uke' | 'radiolines' | 'btmap' | 'quality';

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
  };
  technologies: StatsTechItem[];
  operators: StatsOperatorItem[];
  bands: StatsBandItem[];
  provinces: StatsProvinceItem[];
  radiolines: StatsRadiolinesData;
  dataQuality: StatsDataQuality;
  updatedAt: string;
}

const TECH_COLORS: Record<string, string> = {
  '5G': '#a855f7',
  LTE: '#0ea5e9',
  UMTS: '#10b981',
  GSM: '#f59e0b',
  'GSM-R': '#6366f1',
  IOT: '#ec4899',
  CDMA: '#64748b',
  Inne: '#94a3b8',
};

const RADIOLINE_BAND_COLORS: Record<string, string> = {
  '80 GHz (E-Band)': '#a855f7',
  '38 GHz': '#0ea5e9',
  '32 GHz': '#06b6d4',
  '23 GHz': '#10b981',
  '18 GHz': '#f59e0b',
  '15 GHz': '#f97316',
  '11 / 13 GHz': '#6366f1',
  '7 / 8 GHz': '#ec4899',
};

function getOperatorColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('play')) return '#8b5cf6';
  if (n.includes('orange')) return '#f97316';
  if (n.includes('plus') || n.includes('towerlink')) return '#10b981';
  if (n.includes('t-mobile')) return '#ec4899';
  if (n.includes('pkp')) return '#3b82f6';
  if (n.includes('emitel')) return '#06b6d4';
  if (n.includes('netia')) return '#14b8a6';
  if (n.includes('tauron')) return '#eab308';
  if (n.includes('exatel')) return '#6366f1';
  if (n.includes('pge')) return '#f43f5e';
  return operatorColor(name);
}

function formatPct(value: number): string {
  if (value <= 0) return '0%';
  if (value < 0.1) return '<0.1%';
  return `${value.toFixed(1)}%`;
}

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
  const [opFilter, setOpFilter] = useState<string>('ALL');
  const [hoveredBandKey, setHoveredBandKey] = useState<string | null>(null);
  const [hoveredProvKey, setHoveredProvKey] = useState<string | null>(null);
  const [hoveredTech, setHoveredTech] = useState<string | null>(null);
  const [hoveredOp, setHoveredOp] = useState<string | null>(null);

  const apiSource = activeSection === 'btmap' ? 'BTMAP' : 'UKE';

  const fetchStats = (src: 'UKE' | 'BTMAP') => {
    setLoading(true);
    setError('');
    api<TelecomStats>(`/stats?source=${src}`)
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || (isPl ? 'Nie udało się pobrać statystyk.' : 'Failed to load statistics.'));
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats(apiSource);
  }, [apiSource]);

  const filteredBands = useMemo(() => {
    if (!stats) return [];
    return stats.bands
      .filter((b) => {
        if (techFilter === 'ALL') return true;
        if (techFilter === 'OTHER') return !['5G', 'LTE', 'UMTS', 'GSM'].includes(b.tech);
        return b.tech === techFilter;
      })
      .map((b) => {
        if (opFilter === 'ALL') return b;
        const opItems = b.operators.filter((o) => o.operator === opFilter);
        const opTotal = opItems.reduce((sum, o) => sum + o.count, 0);
        return {
          ...b,
          total: opTotal,
          operators: opItems,
        };
      })
      .filter((b) => b.total > 0);
  }, [stats, techFilter, opFilter]);

  const maxBandTotal = useMemo(() => {
    if (!filteredBands.length) return 1;
    return Math.max(...filteredBands.map((b) => b.total), 1);
  }, [filteredBands]);

  const filteredProvinces = useMemo(() => {
    if (!stats) return [];
    if (opFilter === 'ALL') return stats.provinces;
    return stats.provinces
      .map((p) => {
        const opItems = p.operators.filter((o) => o.operator === opFilter);
        const opTotal = opItems.reduce((sum, o) => sum + o.count, 0);
        return {
          ...p,
          total: opTotal,
          operators: opItems,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [stats, opFilter]);

  const maxProvinceTotal = useMemo(() => {
    if (!filteredProvinces.length) return 1;
    return Math.max(...filteredProvinces.map((p) => p.total), 1);
  }, [filteredProvinces]);

  // Donut slices for Technologies based on mutually exclusive permit share (sums to 100%)
  const techDonutSlices = useMemo(() => {
    if (!stats || !stats.technologies.length) return [];
    const totalPermits = stats.technologies.reduce((acc, t) => acc + t.permits, 0) || 1;
    let cumulative = 0;
    return stats.technologies.map((t) => {
      const fraction = t.permits / totalPermits;
      const start = cumulative;
      cumulative += fraction;
      return {
        ...t,
        fraction,
        start,
        color: TECH_COLORS[t.tech] || TECH_COLORS.Inne,
      };
    });
  }, [stats]);

  // Donut slices for Operators based on station assignments
  const operatorDonutSlices = useMemo(() => {
    if (!stats || !stats.operators.length) return [];
    const totalOpTowers = stats.operators.reduce((acc, o) => acc + o.towers, 0) || 1;
    let cumulative = 0;
    return stats.operators.map((op) => {
      const fraction = op.towers / totalOpTowers;
      const start = cumulative;
      cumulative += fraction;
      return {
        ...op,
        fraction,
        start,
        color: getOperatorColor(op.name),
      };
    });
  }, [stats]);

  // Donut slices for Radioline Bands
  const radiolineBandSlices = useMemo(() => {
    if (!stats || !stats.radiolines?.bands.length) return [];
    const totalLinks = stats.radiolines.totalLinks || 1;
    let cumulative = 0;
    return stats.radiolines.bands.map((b) => {
      const fraction = b.total / totalLinks;
      const start = cumulative;
      cumulative += fraction;
      return {
        ...b,
        fraction,
        start,
        color: RADIOLINE_BAND_COLORS[b.band] || '#64748b',
      };
    });
  }, [stats]);

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
      <section className="content-view stats-dashboard">
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

  const sectionMeta: Record<StatsSection, { title: string; subtitle: string; badge: string }> = {
    uke: {
      title: isPl ? 'Rejestr pozwoleń radiowych UKE' : 'UKE Radio Permit Registry',
      subtitle: isPl
        ? 'Struktura stacji bazowych, operatorów MNO oraz przydziałów pasm częstotliwości na podstawie oficjalnego wykazu Urzędu Komunikacji Elektronicznej.'
        : 'Base station infrastructure, MNO distribution, and frequency band allocations from the official UKE registry.',
      badge: stats?.dataQuality.ukeWykazDate
        ? isPl
          ? `Wykaz UKE: ${stats.dataQuality.ukeWykazDate}`
          : `UKE Registry: ${stats.dataQuality.ukeWykazDate}`
        : 'Rejestr UKE',
    },
    radiolines: {
      title: isPl ? 'Radiolinie UKE (linie punkt–punkt)' : 'UKE Microwave Links (Point-to-Point)',
      subtitle: isPl
        ? 'Analiza łączy mikrofalowych w pasmach od 7 GHz do 86 GHz (E-Band), rozkład operatorów oraz długość przęseł transmisyjnych w Polsce.'
        : 'Analysis of point-to-point microwave backhaul links across 7 GHz – 86 GHz (E-Band), operators, and hop distances.',
      badge: isPl ? 'Baza radiolinii UKE' : 'UKE Microwave Registry',
    },
    btmap: {
      title: isPl ? 'Wewnętrzna baza stacji BTMap' : 'BTMap Internal Station Database',
      subtitle: isPl
        ? 'Zestawienie zweryfikowanych fizycznie stacji bazowych, sektorów oraz parametrów radiowych (CID, ECI, PCI, EARFCN) utrzymywanych przez społeczność.'
        : 'Summary of community-verified base stations, sectors, and cellular parameters (CID, ECI, PCI, EARFCN).',
      badge: isPl ? 'Baza społeczności BTMap' : 'BTMap Community DB',
    },
    quality: {
      title: isPl ? 'Jakość danych i nasycenie sieci' : 'Data Quality & Network Modernization',
      subtitle: isPl
        ? 'Wskaźniki kompletności danych geograficznych, agregacji pasm LTE-Advanced, wdrożeń 5G C-Band (3.6 GHz) oraz integracji pomiarów SI2PEM.'
        : 'Completeness metrics for geographic coordinates, LTE-Advanced carrier aggregation, 5G C-Band (3.6 GHz), and SI2PEM reports.',
      badge: isPl ? 'Audyt spójności bazy' : 'Database Integrity Audit',
    },
  };

  const currentMeta = sectionMeta[activeSection];
  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="content-view stats-dashboard">
      {/* Top Header */}
      <header className="stats-header">
        <div className="stats-header-title">
          <div className="stats-title-badge-row">
            <span className="stats-source-tag">
              <Database size={12} />
              {currentMeta.badge}
            </span>
            <div className="stats-section-pills" role="tablist" aria-label={isPl ? 'Sekcje statystyk' : 'Statistics sections'}>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'uke'}
                className={activeSection === 'uke' ? 'active' : ''}
                onClick={() => setSection('uke')}
              >
                {isPl ? 'Rejestr UKE' : 'UKE Registry'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'radiolines'}
                className={activeSection === 'radiolines' ? 'active' : ''}
                onClick={() => setSection('radiolines')}
              >
                {isPl ? 'Radiolinie UKE' : 'Microwave Links'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'btmap'}
                className={activeSection === 'btmap' ? 'active' : ''}
                onClick={() => setSection('btmap')}
              >
                {isPl ? 'Wewnętrzna baza' : 'Internal DB'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'quality'}
                className={activeSection === 'quality' ? 'active' : ''}
                onClick={() => setSection('quality')}
              >
                {isPl ? 'Jakość danych' : 'Data Quality'}
              </button>
            </div>
          </div>
          <h1>{currentMeta.title}</h1>
          <p>{currentMeta.subtitle}</p>
        </div>

        <div className="stats-header-controls">
          <div className="stats-action-buttons">
            <button
              type="button"
              className="secondary-button stats-export-btn"
              onClick={exportCsv}
              disabled={!stats || loading}
              title={isPl ? 'Eksportuj dane widoku do pliku CSV' : 'Export current view to CSV'}
            >
              <ArrowDownToLine size={15} />
              <span>{isPl ? 'Eksport CSV' : 'Export CSV'}</span>
            </button>
            <button
              type="button"
              className="icon-button stats-refresh-btn"
              onClick={() => fetchStats(apiSource)}
              disabled={loading}
              aria-label={isPl ? 'Odśwież dane' : 'Refresh data'}
              title={isPl ? 'Odśwież dane' : 'Refresh data'}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      {loading && !stats ? (
        <div className="stats-skeleton-grid">
          <div className="stats-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stats-skeleton-card kpi" />
            ))}
          </div>
          <div className="stats-row-2col">
            <div className="stats-skeleton-card chart" />
            <div className="stats-skeleton-card chart" />
          </div>
          <div className="stats-skeleton-card wide" />
        </div>
      ) : stats ? (
        <>
          {/* =========================================================
              SECTION 1 & 3: REJESTR UKE / WEWNĘTRZNA BAZA BTMAP
             ========================================================= */}
          {(activeSection === 'uke' || activeSection === 'btmap') && (
            <>
              <div className="stats-kpi-grid">
                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {activeSection === 'btmap'
                        ? isPl
                          ? 'Stacje w bazie BTMap'
                          : 'BTMap Stations'
                        : isPl
                        ? 'Lokalizacje w rejestrze UKE'
                        : 'UKE Registry Locations'}
                    </span>
                    <span className="stats-kpi-icon blue">
                      <RadioTower size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">{formatNumber(stats.summary.totalTowers)}</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {activeSection === 'btmap'
                        ? isPl
                          ? 'Zweryfikowane przez społeczność'
                          : 'Community verified locations'
                        : isPl
                        ? 'Unikalne lokalizacje stacji bazowych'
                        : 'Unique base station coordinates'}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {activeSection === 'btmap'
                        ? isPl
                          ? 'Zweryfikowane komórki'
                          : 'Verified Cells'
                        : isPl
                        ? 'Pozwolenia radiowe UKE'
                        : 'UKE Radio Permits'}
                    </span>
                    <span className="stats-kpi-icon purple">
                      <Layers size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">
                    {formatNumber(activeSection === 'btmap' ? stats.summary.totalCells : stats.summary.totalPermits)}
                  </strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {stats.summary.totalTowers > 0
                        ? isPl
                          ? `Średnio ${(stats.summary.totalPermits / stats.summary.totalTowers).toFixed(1)} wpisów na stację`
                          : `Avg ${(stats.summary.totalPermits / stats.summary.totalTowers).toFixed(1)} entries per station`
                        : isPl
                        ? 'Sektory z danymi CID / PCI / EARFCN'
                        : 'Sectors with CID / PCI / EARFCN'}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Stacje 5G (NR)' : '5G (NR) Stations'}
                    </span>
                    <span className="stats-kpi-icon emerald">
                      <Sparkles size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">
                    {formatNumber(stats.technologies.find((t) => t.tech === '5G')?.towers ?? 0)}
                  </strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `${formatPct(stats.technologies.find((t) => t.tech === '5G')?.percent ?? 0)} wszystkich stacji (${formatNumber(stats.dataQuality.fiveGCBandTowers)} C-Band)`
                        : `${formatPct(stats.technologies.find((t) => t.tech === '5G')?.percent ?? 0)} of all stations (${formatNumber(stats.dataQuality.fiveGCBandTowers)} C-Band)`}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Stacje wielopasmowe LTE-A' : 'Multi-band LTE-A Sites'}
                    </span>
                    <span className="stats-kpi-icon amber">
                      <Cpu size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">{formatNumber(stats.dataQuality.multiBandLteTowers)}</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {stats.summary.totalTowers > 0
                        ? isPl
                          ? `${((stats.dataQuality.multiBandLteTowers / stats.summary.totalTowers) * 100).toFixed(1)}% stacji z agregacją ≥3 pasm LTE`
                          : `${((stats.dataQuality.multiBandLteTowers / stats.summary.totalTowers) * 100).toFixed(1)}% sites with ≥3 LTE bands`
                        : isPl
                        ? 'Agregacja min. 3 pasm częstotliwości LTE'
                        : 'Carrier aggregation of ≥3 LTE bands'}
                    </span>
                  </div>
                </article>
              </div>

              {stats.summary.totalTowers === 0 ? (
                <article className="stats-panel stats-empty-btmap">
                  <div className="stats-empty-btmap-inner">
                    <Radio size={32} />
                    <div>
                      <h2>
                        {isPl
                          ? 'Wewnętrzna baza społeczności BTMap nie zawiera jeszcze zatwierdzonych stacji'
                          : 'The BTMap internal community database has no approved stations yet'}
                      </h2>
                      <p>
                        {isPl
                          ? `W bazie znajduje się obecnie ${formatNumber(stats.summary.ukeTowers)} oficjalnych lokalizacji z rejestru UKE oraz ${formatNumber(stats.radiolines.totalLinks)} linii radiowych. Możesz dodać lub zweryfikować pierwszą stację bezpośrednio z widoku mapy.`
                          : `The database currently holds ${formatNumber(stats.summary.ukeTowers)} official UKE locations and ${formatNumber(stats.radiolines.totalLinks)} microwave links. You can submit and verify stations directly from the map.`}
                      </p>
                      <div className="stats-empty-actions">
                        <button type="button" className="primary-button" onClick={() => setSection('uke')}>
                          {isPl ? 'Zobacz statystyki Rejestru UKE' : 'View UKE Registry Statistics'}
                        </button>
                        <button type="button" className="secondary-button" onClick={() => setSection('quality')}>
                          {isPl ? 'Sprawdź jakość danych' : 'Check Data Quality'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ) : (
                <>
                  {/* Row 1: Technology & Operator Distribution */}
                  <div className="stats-row-2col">
                    {/* Technology Card */}
                    <article className="stats-panel">
                      <div className="stats-panel-head">
                        <div>
                          <h2>{isPl ? 'Podział według technologii' : 'Distribution by Technology'}</h2>
                          <p>
                            {isPl
                              ? 'Wykres kołowy obrazuje udział w ogólnej puli pozwoleń (100%), a kolumna prawa penetrację na stacjach.'
                              : 'Donut chart shows share of total permits (100%); right column shows station penetration.'}
                          </p>
                        </div>
                      </div>

                      <div className="stats-donut-layout">
                        <div className="stats-donut-box">
                          <svg viewBox="0 0 160 160" className="stats-donut-svg">
                            <circle
                              cx="80"
                              cy="80"
                              r={radius}
                              fill="transparent"
                              stroke="var(--line)"
                              strokeWidth="18"
                            />
                            {techDonutSlices.map((slice) => {
                              const dash = slice.fraction * circumference;
                              const offset = -slice.start * circumference;
                              const isHovered = hoveredTech === slice.tech;
                              return (
                                <circle
                                  key={slice.tech}
                                  cx="80"
                                  cy="80"
                                  r={radius}
                                  fill="transparent"
                                  stroke={slice.color}
                                  strokeWidth={isHovered ? '22' : '18'}
                                  strokeDasharray={`${dash} ${circumference}`}
                                  strokeDashoffset={offset}
                                  transform="rotate(-90 80 80)"
                                  className="stats-donut-segment"
                                  style={{
                                    opacity: hoveredTech && !isHovered ? 0.35 : 1,
                                  }}
                                  onMouseEnter={() => setHoveredTech(slice.tech)}
                                  onMouseLeave={() => setHoveredTech(null)}
                                />
                              );
                            })}
                          </svg>
                          <div className="stats-donut-center">
                            {hoveredTech ? (
                              <>
                                <span>{hoveredTech}</span>
                                <strong>
                                  {formatPct(
                                    techDonutSlices.find((s) => s.tech === hoveredTech)?.permitPercent ?? 0
                                  )}
                                </strong>
                                <small>{isPl ? 'pozwoleń' : 'of permits'}</small>
                              </>
                            ) : (
                              <>
                                <span>{isPl ? 'Pozwolenia' : 'Permits'}</span>
                                <strong>{formatNumber(stats.summary.totalPermits)}</strong>
                                <small>100%</small>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="stats-legend-list">
                          {techDonutSlices.map((item) => (
                            <div
                              key={item.tech}
                              className={`stats-legend-item ${hoveredTech === item.tech ? 'is-hovered' : ''}`}
                              onMouseEnter={() => setHoveredTech(item.tech)}
                              onMouseLeave={() => setHoveredTech(null)}
                            >
                              <div className="stats-legend-main">
                                <span className="stats-legend-dot" style={{ background: item.color }} />
                                <strong className="stats-legend-name">{item.tech}</strong>
                                <span className="stats-legend-badge">
                                  {formatPct(item.permitPercent)} {isPl ? 'pozw.' : 'permits'}
                                </span>
                              </div>
                              <div className="stats-legend-metrics">
                                <strong>{formatNumber(item.towers)} {isPl ? 'stacji' : 'sites'}</strong>
                                <small>
                                  {formatPct(item.percent)} {isPl ? 'stacji' : 'sites'} · {formatNumber(item.permits)} {isPl ? 'pozw.' : 'perm.'}
                                </small>
                              </div>
                              <div className="stats-legend-bar-track">
                                <div
                                  className="stats-legend-bar-fill"
                                  style={{
                                    width: `${Math.min(100, item.percent)}%`,
                                    background: item.color,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>

                    {/* Operator Card */}
                    <article className="stats-panel">
                      <div className="stats-panel-head">
                        <div>
                          <h2>{isPl ? 'Podział według operatora' : 'Distribution by Operator'}</h2>
                          <p>
                            {isPl
                              ? 'Liczba obsługiwanych lokalizacji oraz łączna pula pozwoleń radiowych każdego operatora.'
                              : 'Number of active base station locations and total radio permits per operator.'}
                          </p>
                        </div>
                      </div>

                      <div className="stats-donut-layout">
                        <div className="stats-donut-box">
                          <svg viewBox="0 0 160 160" className="stats-donut-svg">
                            <circle
                              cx="80"
                              cy="80"
                              r={radius}
                              fill="transparent"
                              stroke="var(--line)"
                              strokeWidth="18"
                            />
                            {operatorDonutSlices.map((slice) => {
                              const dash = slice.fraction * circumference;
                              const offset = -slice.start * circumference;
                              const isHovered = hoveredOp === slice.name;
                              return (
                                <circle
                                  key={slice.name}
                                  cx="80"
                                  cy="80"
                                  r={radius}
                                  fill="transparent"
                                  stroke={slice.color}
                                  strokeWidth={isHovered ? '22' : '18'}
                                  strokeDasharray={`${dash} ${circumference}`}
                                  strokeDashoffset={offset}
                                  transform="rotate(-90 80 80)"
                                  className="stats-donut-segment"
                                  style={{
                                    opacity: hoveredOp && !isHovered ? 0.35 : 1,
                                  }}
                                  onMouseEnter={() => setHoveredOp(slice.name)}
                                  onMouseLeave={() => setHoveredOp(null)}
                                />
                              );
                            })}
                          </svg>
                          <div className="stats-donut-center">
                            {hoveredOp ? (
                              <>
                                <span>{hoveredOp}</span>
                                <strong>
                                  {formatPct(
                                    operatorDonutSlices.find((s) => s.name === hoveredOp)?.percent ?? 0
                                  )}
                                </strong>
                                <small>{isPl ? 'lokalizacji' : 'of sites'}</small>
                              </>
                            ) : (
                              <>
                                <span>{isPl ? 'Lokalizacje' : 'Locations'}</span>
                                <strong>{formatNumber(stats.summary.totalTowers)}</strong>
                                <small>{stats.operators.length} {isPl ? 'oper.' : 'ops'}</small>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="stats-legend-list">
                          {operatorDonutSlices.map((op) => (
                            <div
                              key={op.name}
                              className={`stats-legend-item ${hoveredOp === op.name ? 'is-hovered' : ''}`}
                              onMouseEnter={() => setHoveredOp(op.name)}
                              onMouseLeave={() => setHoveredOp(null)}
                            >
                              <div className="stats-legend-main">
                                <span className="stats-legend-dot" style={{ background: op.color }} />
                                <strong className="stats-legend-name">{op.name}</strong>
                                <span className="stats-legend-badge">{formatPct(op.percent)}</span>
                              </div>
                              <div className="stats-legend-metrics">
                                <strong>{formatNumber(op.towers)} {isPl ? 'stacji' : 'sites'}</strong>
                                <small>
                                  {formatNumber(op.permits)} {isPl ? 'pozw.' : 'perm.'} ({formatPct(op.permitPercent)})
                                </small>
                              </div>
                              <div className="stats-legend-bar-track">
                                <div
                                  className="stats-legend-bar-fill"
                                  style={{
                                    width: `${Math.max(1.5, Math.min(100, op.percent))}%`,
                                    background: op.color,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  </div>

                  {/* Operator Filter Bar for Detailed Charts */}
                  <div className="stats-global-filter-bar">
                    <span className="stats-filter-label">
                      {isPl ? 'Filtruj wykresy pasm i województw wg operatora:' : 'Filter band & province charts by operator:'}
                    </span>
                    <div className="stats-op-pills">
                      <button
                        type="button"
                        className={opFilter === 'ALL' ? 'active' : ''}
                        onClick={() => setOpFilter('ALL')}
                      >
                        {isPl ? 'Wszyscy operatorzy' : 'All operators'}
                      </button>
                      {stats.operators.slice(0, 5).map((op) => (
                        <button
                          key={op.name}
                          type="button"
                          className={opFilter === op.name ? 'active' : ''}
                          onClick={() => setOpFilter(opFilter === op.name ? 'ALL' : op.name)}
                        >
                          <i style={{ background: getOperatorColor(op.name) }} />
                          {op.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row 2: Unique Stations by Band */}
                  <article className="stats-panel stats-panel-wide">
                    <div className="stats-panel-head">
                      <div>
                        <h2>{isPl ? 'Unikalne stacje według pasma (MHz)' : 'Unique Stations by Frequency Band (MHz)'}</h2>
                        <p>
                          {isPl
                            ? 'Liczba stacji bazowych wyposażonych w poszczególne pasma radiowe z podziałem na operatorów.'
                            : 'Number of base stations equipped with each frequency band broken down by operator.'}
                        </p>
                      </div>
                      <div className="stats-tech-filter-pills">
                        {(['ALL', '5G', 'LTE', 'UMTS', 'GSM', 'OTHER'] as const).map((tf) => (
                          <button
                            key={tf}
                            type="button"
                            className={techFilter === tf ? 'active' : ''}
                            onClick={() => setTechFilter(tf)}
                          >
                            {tf === 'ALL'
                              ? isPl
                                ? 'Wszystkie'
                                : 'All'
                              : tf === 'OTHER'
                              ? isPl
                                ? 'Inne'
                                : 'Other'
                              : tf}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="stats-stacked-bars">
                      {filteredBands.map((b) => {
                        const widthPct = Math.max(2, (b.total / maxBandTotal) * 100);
                        const isHovered = hoveredBandKey === b.key;
                        return (
                          <div
                            key={b.key}
                            className={`stats-bar-row ${isHovered ? 'is-hovered' : ''}`}
                            onMouseEnter={() => setHoveredBandKey(b.key)}
                            onMouseLeave={() => setHoveredBandKey(null)}
                          >
                            <div className="stats-bar-label">
                              <span
                                className="stats-tech-tag"
                                style={{
                                  background: `${TECH_COLORS[b.tech] || TECH_COLORS.Inne}1f`,
                                  color: TECH_COLORS[b.tech] || TECH_COLORS.Inne,
                                  borderColor: `${TECH_COLORS[b.tech] || TECH_COLORS.Inne}45`,
                                }}
                              >
                                {b.tech}
                              </span>
                              <strong>{b.band} MHz</strong>
                            </div>

                            <div className="stats-bar-track-wrap">
                              <div className="stats-bar-stacked" style={{ width: `${widthPct}%` }}>
                                {b.operators.map((op) => {
                                  const segPct = b.total > 0 ? (op.count / b.total) * 100 : 0;
                                  return (
                                    <div
                                      key={op.operator}
                                      className="stats-bar-segment"
                                      style={{
                                        width: `${segPct}%`,
                                        background: getOperatorColor(op.operator),
                                      }}
                                    />
                                  );
                                })}
                              </div>

                              {isHovered && (
                                <div className="stats-bar-tooltip" role="tooltip">
                                  <div className="stats-bar-tooltip-head">
                                    <strong>{b.tech} {b.band} MHz</strong>
                                    <span>{formatNumber(b.total)} {isPl ? 'stacji' : 'sites'}</span>
                                  </div>
                                  <div className="stats-bar-tooltip-list">
                                    {b.operators.map((op) => (
                                      <div key={op.operator} className="stats-bar-tooltip-item">
                                        <span>
                                          <i style={{ background: getOperatorColor(op.operator) }} />
                                          {op.operator}
                                        </span>
                                        <strong>
                                          {formatNumber(op.count)}{' '}
                                          <small>({((op.count / b.total) * 100).toFixed(1)}%)</small>
                                        </strong>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="stats-bar-value">
                              <strong>{formatNumber(b.total)}</strong>
                              <small>
                                {stats.summary.totalTowers > 0
                                  ? `${((b.total / stats.summary.totalTowers) * 100).toFixed(1)}%`
                                  : ''}
                              </small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>

                  {/* Row 3: Unique Stations by Province */}
                  <article className="stats-panel stats-panel-wide">
                    <div className="stats-panel-head">
                      <div>
                        <h2>{isPl ? 'Unikalne stacje według województwa' : 'Unique Stations by Province'}</h2>
                        <p>
                          {isPl
                            ? `Rozkład wszystkich ${formatNumber(stats.summary.totalTowers)} lokalizacji w 16 województwach.`
                            : `Geographic breakdown of all ${formatNumber(stats.summary.totalTowers)} locations across 16 provinces.`}
                        </p>
                      </div>
                    </div>

                    <div className="stats-stacked-bars">
                      {filteredProvinces.map((p, idx) => {
                        const widthPct = Math.max(2, (p.total / maxProvinceTotal) * 100);
                        const isHovered = hoveredProvKey === p.province;
                        return (
                          <div
                            key={p.province}
                            className={`stats-bar-row ${isHovered ? 'is-hovered' : ''}`}
                            onMouseEnter={() => setHoveredProvKey(p.province)}
                            onMouseLeave={() => setHoveredProvKey(null)}
                          >
                            <div className="stats-bar-label province-label">
                              <span className="stats-rank-num">{idx + 1}.</span>
                              <strong>{p.province}</strong>
                            </div>

                            <div className="stats-bar-track-wrap">
                              <div className="stats-bar-stacked" style={{ width: `${widthPct}%` }}>
                                {p.operators.map((op) => {
                                  const segPct = p.total > 0 ? (op.count / p.total) * 100 : 0;
                                  return (
                                    <div
                                      key={op.operator}
                                      className="stats-bar-segment"
                                      style={{
                                        width: `${segPct}%`,
                                        background: getOperatorColor(op.operator),
                                      }}
                                    />
                                  );
                                })}
                              </div>

                              {isHovered && (
                                <div className="stats-bar-tooltip" role="tooltip">
                                  <div className="stats-bar-tooltip-head">
                                    <strong>{p.province}</strong>
                                    <span>{formatNumber(p.total)} {isPl ? 'stacji' : 'sites'}</span>
                                  </div>
                                  <div className="stats-bar-tooltip-list">
                                    {p.operators.map((op) => (
                                      <div key={op.operator} className="stats-bar-tooltip-item">
                                        <span>
                                          <i style={{ background: getOperatorColor(op.operator) }} />
                                          {op.operator}
                                        </span>
                                        <strong>{formatNumber(op.count)}</strong>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="stats-bar-value">
                              <strong>{formatNumber(p.total)}</strong>
                              <small>
                                {stats.summary.totalTowers > 0
                                  ? `${((p.total / stats.summary.totalTowers) * 100).toFixed(1)}%`
                                  : ''}
                              </small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                </>
              )}
            </>
          )}

          {/* =========================================================
              SECTION 2: RADIOLINIE UKE
             ========================================================= */}
          {activeSection === 'radiolines' && stats.radiolines && (
            <>
              <div className="stats-kpi-grid">
                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Linie radiowe UKE' : 'UKE Microwave Links'}
                    </span>
                    <span className="stats-kpi-icon blue">
                      <Radio size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">{formatNumber(stats.radiolines.totalLinks)}</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `Zarejestrowane przęsła punkt-punkt (${formatNumber(stats.radiolines.newLinks)} nowych)`
                        : `Point-to-point hops (${formatNumber(stats.radiolines.newLinks)} new)`}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Łączna długość przęseł' : 'Total Hop Distance'}
                    </span>
                    <span className="stats-kpi-icon emerald">
                      <MapPin size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">{formatNumber(stats.radiolines.totalLengthKm)} km</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `Średni dystans: ${stats.radiolines.avgDistanceKm} km · maks. ${stats.radiolines.maxDistanceKm} km`
                        : `Avg hop: ${stats.radiolines.avgDistanceKm} km · max ${stats.radiolines.maxDistanceKm} km`}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Pasmo E-Band (71–86 GHz)' : 'E-Band (71–86 GHz)'}
                    </span>
                    <span className="stats-kpi-icon purple">
                      <Signal size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">
                    {formatNumber(
                      stats.radiolines.bands.find((b) => b.band.includes('80 GHz'))?.total ?? 0
                    )}
                  </strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `${stats.radiolines.bands.find((b) => b.band.includes('80 GHz'))?.percent ?? 0}% wszystkich radiolinii (wysoka przepustowość)`
                        : `${stats.radiolines.bands.find((b) => b.band.includes('80 GHz'))?.percent ?? 0}% of all links (high capacity)`}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Udział 4 operatorów MNO' : '4 MNO Operators Share'}
                    </span>
                    <span className="stats-kpi-icon amber">
                      <Layers size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">
                    {formatPct(
                      stats.radiolines.operators
                        .filter((o) => ['Play', 'Plus', 'T-Mobile', 'Orange'].includes(o.group))
                        .reduce((s, o) => s + o.percent, 0)
                    )}
                  </strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? 'Play, Plus (Towerlink), T-Mobile i Orange Polska'
                        : 'Play, Plus (Towerlink), T-Mobile & Orange'}
                    </span>
                  </div>
                </article>
              </div>

              <div className="stats-row-2col">
                {/* Radioline Bands Card */}
                <article className="stats-panel">
                  <div className="stats-panel-head">
                    <div>
                      <h2>{isPl ? 'Pasma częstotliwości radiolinii (GHz)' : 'Microwave Frequency Bands (GHz)'}</h2>
                      <p>
                        {isPl
                          ? 'Podział na pasma ITU wraz ze średnią długością przęsła w kilometrach.'
                          : 'Breakdown by ITU frequency band and average hop distance in km.'}
                      </p>
                    </div>
                  </div>

                  <div className="stats-donut-layout">
                    <div className="stats-donut-box">
                      <svg viewBox="0 0 160 160" className="stats-donut-svg">
                        <circle
                          cx="80"
                          cy="80"
                          r={radius}
                          fill="transparent"
                          stroke="var(--line)"
                          strokeWidth="18"
                        />
                        {radiolineBandSlices.map((slice) => {
                          const dash = slice.fraction * circumference;
                          const offset = -slice.start * circumference;
                          const isHovered = hoveredTech === slice.band;
                          return (
                            <circle
                              key={slice.band}
                              cx="80"
                              cy="80"
                              r={radius}
                              fill="transparent"
                              stroke={slice.color}
                              strokeWidth={isHovered ? '22' : '18'}
                              strokeDasharray={`${dash} ${circumference}`}
                              strokeDashoffset={offset}
                              transform="rotate(-90 80 80)"
                              className="stats-donut-segment"
                              onMouseEnter={() => setHoveredTech(slice.band)}
                              onMouseLeave={() => setHoveredTech(null)}
                            />
                          );
                        })}
                      </svg>
                      <div className="stats-donut-center">
                        <span>{isPl ? 'Radiolinie' : 'Links'}</span>
                        <strong>{formatNumber(stats.radiolines.totalLinks)}</strong>
                        <small>7–86 GHz</small>
                      </div>
                    </div>

                    <div className="stats-legend-list">
                      {radiolineBandSlices.map((b) => (
                        <div
                          key={b.band}
                          className={`stats-legend-item ${hoveredTech === b.band ? 'is-hovered' : ''}`}
                          onMouseEnter={() => setHoveredTech(b.band)}
                          onMouseLeave={() => setHoveredTech(null)}
                        >
                          <div className="stats-legend-main">
                            <span className="stats-legend-dot" style={{ background: b.color }} />
                            <strong className="stats-legend-name">{b.band}</strong>
                            <span className="stats-legend-badge">{formatPct(b.percent)}</span>
                          </div>
                          <div className="stats-legend-metrics">
                            <strong>{formatNumber(b.total)} {isPl ? 'linii' : 'links'}</strong>
                            <small>{isPl ? `śr. ${b.avgDistanceKm} km` : `avg ${b.avgDistanceKm} km`}</small>
                          </div>
                          <div className="stats-legend-bar-track">
                            <div
                              className="stats-legend-bar-fill"
                              style={{
                                width: `${Math.max(2, b.percent)}%`,
                                background: b.color,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                {/* Radioline Operators Card */}
                <article className="stats-panel">
                  <div className="stats-panel-head">
                    <div>
                      <h2>{isPl ? 'Operatorzy linii radiowych' : 'Microwave Link Operators'}</h2>
                      <p>
                        {isPl
                          ? 'Najwięksi dysponenci linii radiowych w Polsce wraz ze średnią długością przęsła.'
                          : 'Largest microwave link operators in Poland with average hop distance.'}
                      </p>
                    </div>
                  </div>

                  <div className="stats-legend-list">
                    {stats.radiolines.operators.map((op) => {
                      const color = getOperatorColor(op.name);
                      return (
                        <div key={op.name} className="stats-legend-item">
                          <div className="stats-legend-main">
                            <span className="stats-legend-dot" style={{ background: color }} />
                            <strong className="stats-legend-name">{op.name}</strong>
                            <span className="stats-legend-badge">{formatPct(op.percent)}</span>
                          </div>
                          <div className="stats-legend-metrics">
                            <strong>{formatNumber(op.links)} {isPl ? 'linii' : 'links'}</strong>
                            <small>{isPl ? `śr. ${op.avgDistanceKm} km` : `avg ${op.avgDistanceKm} km`}</small>
                          </div>
                          <div className="stats-legend-bar-track">
                            <div
                              className="stats-legend-bar-fill"
                              style={{
                                width: `${Math.max(1.5, op.percent)}%`,
                                background: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </div>

              {/* Radiolines by Province */}
              <article className="stats-panel stats-panel-wide">
                <div className="stats-panel-head">
                  <div>
                    <h2>{isPl ? 'Linie radiowe według województwa' : 'Microwave Links by Province'}</h2>
                    <p>
                      {isPl
                        ? 'Rozkład przęseł radioliniowych w 16 województwach z podziałem na operatorów.'
                        : 'Distribution of microwave hops across 16 provinces by operator.'}
                    </p>
                  </div>
                </div>

                <div className="stats-stacked-bars">
                  {stats.radiolines.provinces.map((p, idx) => {
                    const maxRlProv = stats.radiolines.provinces[0]?.total || 1;
                    const widthPct = Math.max(2, (p.total / maxRlProv) * 100);
                    return (
                      <div key={p.province} className="stats-bar-row">
                        <div className="stats-bar-label province-label">
                          <span className="stats-rank-num">{idx + 1}.</span>
                          <strong>{p.province}</strong>
                        </div>
                        <div className="stats-bar-track-wrap">
                          <div className="stats-bar-stacked" style={{ width: `${widthPct}%` }}>
                            {p.operators.map((op) => (
                              <div
                                key={op.operator}
                                className="stats-bar-segment"
                                style={{
                                  width: `${(op.count / p.total) * 100}%`,
                                  background: getOperatorColor(op.operator),
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="stats-bar-value">
                          <strong>{formatNumber(p.total)}</strong>
                          <small>{((p.total / stats.radiolines.totalLinks) * 100).toFixed(1)}%</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </>
          )}

          {/* =========================================================
              SECTION 4: JAKOŚĆ DANYCH
             ========================================================= */}
          {activeSection === 'quality' && stats.dataQuality && (
            <>
              <div className="stats-kpi-grid">
                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Spójność lokalizacji GPS' : 'GPS Coordinate Integrity'}
                    </span>
                    <span className="stats-kpi-icon emerald">
                      <CheckCircle2 size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">100.0%</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `${formatNumber(stats.dataQuality.withFullAddress)} z ${formatNumber(stats.dataQuality.totalTowers)} stacji z pełnym adresem`
                        : `${formatNumber(stats.dataQuality.withFullAddress)} of ${formatNumber(stats.dataQuality.totalTowers)} with full address`}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Pokrycie województw' : 'Province Attribution'}
                    </span>
                    <span className="stats-kpi-icon blue">
                      <ShieldCheck size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">
                    {stats.dataQuality.totalTowers > 0
                      ? `${((stats.dataQuality.withExplicitProvince / stats.dataQuality.totalTowers) * 100).toFixed(1)}%`
                      : '100%'}
                  </strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `${formatNumber(stats.dataQuality.withExplicitProvince)} z UKE + ${formatNumber(stats.dataQuality.inferredProvince)} przypisanych z koordynatów`
                        : `${formatNumber(stats.dataQuality.withExplicitProvince)} explicit + ${formatNumber(stats.dataQuality.inferredProvince)} inferred`}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Stacje 5G C-Band (3.6 GHz)' : '5G C-Band (3.6 GHz) Sites'}
                    </span>
                    <span className="stats-kpi-icon purple">
                      <Sparkles size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">{formatNumber(stats.dataQuality.fiveGCBandTowers)}</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {stats.dataQuality.totalTowers > 0
                        ? isPl
                          ? `${((stats.dataQuality.fiveGCBandTowers / stats.dataQuality.totalTowers) * 100).toFixed(1)}% wszystkich stacji w kraju`
                          : `${((stats.dataQuality.fiveGCBandTowers / stats.dataQuality.totalTowers) * 100).toFixed(1)}% of all sites nationwide`
                        : ''}
                    </span>
                  </div>
                </article>

                <article className="stats-kpi-card">
                  <div className="stats-kpi-top">
                    <span className="stats-kpi-label">
                      {isPl ? 'Plany pomiarowe SI2PEM' : 'SI2PEM Measurement Plans'}
                    </span>
                    <span className="stats-kpi-icon amber">
                      <Activity size={17} />
                    </span>
                  </div>
                  <strong className="stats-kpi-value">{formatNumber(stats.dataQuality.pemPlansCount)}</strong>
                  <div className="stats-kpi-foot">
                    <span>
                      {isPl
                        ? `${formatNumber(stats.dataQuality.pemCachedReports)} raportów PEM w pamięci podręcznej (${stats.dataQuality.pemCachedTowers} stacji)`
                        : `${formatNumber(stats.dataQuality.pemCachedReports)} cached PEM reports (${stats.dataQuality.pemCachedTowers} sites)`}
                    </span>
                  </div>
                </article>
              </div>

              <div className="stats-row-2col">
                <article className="stats-panel">
                  <div className="stats-panel-head">
                    <div>
                      <h2>{isPl ? 'Nasycenie technologiczne i modernizacja sieci' : 'Network Modernization & Capacity Indicators'}</h2>
                      <p>
                        {isPl
                          ? 'Odsetek stacji bazowych spełniających kryteria nowoczesnej sieci wielopasmowej.'
                          : 'Share of base stations meeting multi-band and next-generation deployment criteria.'}
                      </p>
                    </div>
                  </div>

                  <div className="stats-quality-list">
                    {[
                      {
                        label: isPl ? 'Agregacja LTE-Advanced (≥3 pasma LTE na stacji)' : 'LTE-Advanced CA (≥3 LTE bands per site)',
                        count: stats.dataQuality.multiBandLteTowers,
                        total: stats.dataQuality.totalTowers,
                        color: '#0ea5e9',
                      },
                      {
                        label: isPl ? 'Komplet pasm LTE-Advanced Pro (≥4 pasma LTE)' : 'Full LTE-Advanced Pro (≥4 LTE bands)',
                        count: stats.dataQuality.fourBandLteTowers,
                        total: stats.dataQuality.totalTowers,
                        color: '#38bdf8',
                      },
                      {
                        label: isPl ? '5G DSS / FDD (pasma 2100 / 1800 / 700 MHz)' : '5G DSS / FDD (2100 / 1800 / 700 MHz)',
                        count: stats.dataQuality.fiveGDssTowers,
                        total: stats.dataQuality.totalTowers,
                        color: '#a855f7',
                      },
                      {
                        label: isPl ? '5G C-Band (pasmo n78 · 3500 / 3600 MHz)' : '5G C-Band (n78 · 3500 / 3600 MHz)',
                        count: stats.dataQuality.fiveGCBandTowers,
                        total: stats.dataQuality.totalTowers,
                        color: '#c084fc',
                      },
                      {
                        label: isPl ? 'Kolokacja operatorów (≥2 operatorów w promieniu 60 m)' : 'Site Co-location (≥2 operators within 60 m)',
                        count: stats.dataQuality.collocatedTowers,
                        total: stats.dataQuality.totalTowers,
                        color: '#10b981',
                      },
                    ].map((item) => {
                      const pct = item.total > 0 ? (item.count / item.total) * 100 : 0;
                      return (
                        <div key={item.label} className="stats-quality-item">
                          <div className="stats-quality-item-head">
                            <span>{item.label}</span>
                            <strong>
                              {formatNumber(item.count)} <small>({pct.toFixed(1)}%)</small>
                            </strong>
                          </div>
                          <div className="stats-legend-bar-track">
                            <div
                              className="stats-legend-bar-fill"
                              style={{ width: `${Math.min(100, pct)}%`, background: item.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="stats-panel">
                  <div className="stats-panel-head">
                    <div>
                      <h2>{isPl ? 'Stan rejestrów i źródeł danych' : 'Data Sources & Registry Status'}</h2>
                      <p>
                        {isPl
                          ? 'Podsumowanie tabel w bazie SQLite oraz dat ostatnich synchronizacji.'
                          : 'Summary of SQLite database tables and latest synchronization timestamps.'}
                      </p>
                    </div>
                  </div>

                  <div className="stats-registry-table-wrap">
                    <table className="stats-registry-table">
                      <thead>
                        <tr>
                          <th>{isPl ? 'Rejestr / Moduł' : 'Registry / Source'}</th>
                          <th>{isPl ? 'Liczba rekordów' : 'Records'}</th>
                          <th>{isPl ? 'Stan danych' : 'Status / Date'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <strong>{isPl ? 'Wykaz stacji bazowych UKE' : 'UKE Base Station Registry'}</strong>
                            <small>{isPl ? 'Pozwolenia radiowe GSM / UMTS / LTE / 5G' : 'GSM / UMTS / LTE / 5G permits'}</small>
                          </td>
                          <td>
                            <strong>{formatNumber(stats.dataQuality.ukeTowers)}</strong> {isPl ? 'stacji' : 'sites'}
                            <br />
                            <small>{formatNumber(stats.summary.totalPermits)} {isPl ? 'pozwoleń' : 'permits'}</small>
                          </td>
                          <td>
                            <span className="stats-status-pill ok">
                              {stats.dataQuality.ukeWykazDate || 'Aktywny'}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>{isPl ? 'Wykaz linii radiowych UKE' : 'UKE Microwave Links'}</strong>
                            <small>{isPl ? 'Przęsła punkt–punkt 7–86 GHz' : 'Point-to-point 7–86 GHz links'}</small>
                          </td>
                          <td>
                            <strong>{formatNumber(stats.radiolines.totalLinks)}</strong> {isPl ? 'linii' : 'links'}
                            <br />
                            <small>{formatNumber(stats.radiolines.newLinks)} {isPl ? 'nowych' : 'new'}</small>
                          </td>
                          <td>
                            <span className="stats-status-pill ok">
                              {stats.dataQuality.radiolinesUpdatedAt
                                ? stats.dataQuality.radiolinesUpdatedAt.slice(0, 10)
                                : 'Aktywny'}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>{isPl ? 'System Informacyjny SI2PEM' : 'SI2PEM Radiation Registry'}</strong>
                            <small>{isPl ? 'Plany i sprawozdania z pomiarów pola EM' : 'EM field measurement plans & reports'}</small>
                          </td>
                          <td>
                            <strong>{formatNumber(stats.dataQuality.pemPlansCount)}</strong> {isPl ? 'planów' : 'plans'}
                            <br />
                            <small>{formatNumber(stats.dataQuality.pemCachedReports)} {isPl ? 'raportów w cache' : 'cached reports'}</small>
                          </td>
                          <td>
                            <span className="stats-status-pill ok">SI2PEM API</span>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>{isPl ? 'Wewnętrzna baza BTMap' : 'BTMap Internal Database'}</strong>
                            <small>{isPl ? 'Zgłoszenia i weryfikacje społeczności' : 'Community submissions & cells'}</small>
                          </td>
                          <td>
                            <strong>{formatNumber(stats.dataQuality.btmapTowers)}</strong> {isPl ? 'stacji' : 'sites'}
                          </td>
                          <td>
                            <span className="stats-status-pill neutral">
                              {health ? (isPl ? 'Połączona' : 'Connected') : (isPl ? 'Aktywna' : 'Active')}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            </>
          )}

          {/* Dynamic Data Verification Footer */}
          <footer className="stats-footer-note">
            <ShieldCheck size={16} />
            <p>
              {isPl
                ? `Dane wyliczane bezpośrednio z bazy SQLite: ${formatNumber(stats.summary.ukeTowers)} lokalizacji UKE (${formatNumber(stats.summary.totalPermits)} pozwoleń radiowych), ${formatNumber(stats.radiolines.totalLinks)} linii radiowych oraz ${formatNumber(stats.summary.btmapTowers)} stacji w wewnętrznej bazie BTMap.`
                : `Metrics computed directly from SQLite: ${formatNumber(stats.summary.ukeTowers)} UKE locations (${formatNumber(stats.summary.totalPermits)} permits), ${formatNumber(stats.radiolines.totalLinks)} microwave links, and ${formatNumber(stats.summary.btmapTowers)} internal BTMap stations.`}
            </p>
          </footer>
        </>
      ) : null}
    </section>
  );
}
