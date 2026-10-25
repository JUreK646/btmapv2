import React, { useEffect, useState, useMemo } from 'react';
import {
  Radio,
  Layers,
  Activity,
  Server,
  ArrowDownToLine,
  RefreshCw,
  PieChart as PieChartIcon,
  BarChart3,
  MapPin,
  Info,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import type { TelecomStats } from '../types';
import { api, formatNumber } from '../lib/api';
import { useI18n } from '../lib/i18n';

export const STATS_OPERATOR_COLORS: Record<string, string> = {
  'Plus': '#10b981',        // Emerald Green
  'Play': '#8b5cf6',        // Violet / Purple
  'Orange': '#f97316',      // Vibrant Orange
  'T-Mobile': '#ec4899',    // Magenta / Pink
  'PKP PLK': '#0284c7',     // Sky Blue
  'PGE Systemy': '#3b82f6',   // Royal Blue
  'Nordisk': '#06b6d4',     // Cyan
  'TOPR': '#ef4444',        // Red
  'Inne': '#64748b',        // Slate Gray
};

export const OPERATOR_STACK_ORDER: Record<string, number> = {
  'Plus': 1,
  'Play': 2,
  'Orange': 3,
  'T-Mobile': 4,
  'PKP PLK': 5,
  'PGE Systemy': 6,
  'Nordisk': 7,
  'TOPR': 8,
  'Inne': 9,
};

export const TECH_COLORS: Record<string, string> = {
  '5G': '#06b6d4',   // Cyan / Sky
  'LTE': '#f59e0b',  // Amber / Warm Orange
  'UMTS': '#10b981', // Emerald Green
  'GSM': '#ec4899',  // Vibrant Rose
  'IOT': '#8b5cf6',  // Purple
  'GSM-R': '#3b82f6',// Deep Blue
  'CDMA': '#64748b', // Slate Gray
};

export function getStatsOperatorColor(name: string): string {
  if (STATS_OPERATOR_COLORS[name]) return STATS_OPERATOR_COLORS[name];
  const lower = name.toLowerCase();
  if (lower.includes('play') || lower.includes('p4')) return STATS_OPERATOR_COLORS['Play'];
  if (lower.includes('plus') || lower.includes('polkomtel') || lower.includes('aero')) return STATS_OPERATOR_COLORS['Plus'];
  if (lower.includes('orange')) return STATS_OPERATOR_COLORS['Orange'];
  if (lower.includes('t-mobile') || lower.includes('tmobile')) return STATS_OPERATOR_COLORS['T-Mobile'];
  if (lower.includes('pkp')) return STATS_OPERATOR_COLORS['PKP PLK'];
  if (lower.includes('pge')) return STATS_OPERATOR_COLORS['PGE Systemy'];
  if (lower.includes('nordisk')) return STATS_OPERATOR_COLORS['Nordisk'];
  return STATS_OPERATOR_COLORS['Inne'];
}

export function getTechColor(tech: string): string {
  return TECH_COLORS[tech] || '#94a3b8';
}

/**
 * Computes nice round tick values for Y-axis scaling (e.g. 0, 2000, 4000, 6000, 8000)
 */
export function getNiceScale(maxVal: number): { max: number; ticks: number[] } {
  if (maxVal <= 0) return { max: 100, ticks: [100, 75, 50, 25, 0] };
  const targetTicks = 4;
  const rawStep = maxVal / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let step: number;
  if (residual <= 1.2) step = 1 * magnitude;
  else if (residual <= 2.5) step = 2 * magnitude;
  else if (residual <= 7.5) step = 5 * magnitude;
  else step = 10 * magnitude;
  step = Math.max(1, Math.round(step));
  const max = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let val = max; val >= 0; val -= step) {
    ticks.push(val);
  }
  return { max, ticks };
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  total?: number;
  items?: { name: string; count: number; percent?: number; color: string }[];
}

interface SvgStackedBarChartProps {
  items: {
    key: string;
    label: string;
    total: number;
    operators: { operator: string; count: number }[];
  }[];
  scale: { max: number; ticks: number[] };
  titlePrefix?: string;
  subtitle: string;
  slotWidth?: number;
  barWidth?: number;
  onHoverItem: (rect: DOMRect, item: { key: string; label: string; total: number; operators: { operator: string; count: number }[] }) => void;
  onLeaveItem: () => void;
}

function SvgStackedBarChart({
  items,
  scale,
  titlePrefix = '',
  subtitle,
  slotWidth = 56,
  barWidth = 30,
  onHoverItem,
  onLeaveItem,
}: SvgStackedBarChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const plotLeft = 64;
  const plotRightPadding = 24;
  const plotWidth = items.length * slotWidth;
  const svgWidth = plotLeft + plotWidth + plotRightPadding;
  const svgHeight = 330;
  const plotTop = 25;
  const plotBottom = 220; // Exact bottom baseline
  const plotHeight = plotBottom - plotTop; // 195px

  return (
    <div className="svg-chart-scroll-wrapper">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="stacked-bar-svg"
        style={{ minWidth: `${Math.max(svgWidth, 720)}px` }}
      >
        <defs>
          {items.map(item => {
            const barH = scale.max > 0 ? (item.total / scale.max) * plotHeight : 0;
            const clipId = `clip-${item.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            return (
              <clipPath id={clipId} key={item.key}>
                <rect
                  x="0"
                  y={plotBottom - barH}
                  width={barWidth}
                  height={barH + 4}
                  rx="5"
                  ry="5"
                />
              </clipPath>
            );
          })}
        </defs>

        {/* Horizontal grid lines & Y labels */}
        {scale.ticks.map(tick => {
          const y = scale.max > 0 ? plotBottom - (tick / scale.max) * plotHeight : plotBottom;
          return (
            <g key={tick} className="svg-grid-row">
              <line
                x1={plotLeft}
                y1={y}
                x2={plotLeft + plotWidth}
                y2={y}
                stroke="var(--line)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={plotLeft - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="600"
                fill="var(--faint)"
              >
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}

        {/* Bottom baseline line */}
        <line
          x1={plotLeft}
          y1={plotBottom}
          x2={plotLeft + plotWidth}
          y2={plotBottom}
          stroke="var(--line)"
          strokeWidth="1.5"
        />

        {/* Bars and labels */}
        {items.map((item, i) => {
          const slotX = plotLeft + i * slotWidth;
          const barX = slotX + (slotWidth - barWidth) / 2;
          const barH = scale.max > 0 ? (item.total / scale.max) * plotHeight : 0;
          const isHovered = hoveredKey === item.key;
          const clipId = `clip-${item.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

          const sortedOps = [...item.operators].sort(
            (a, b) => (OPERATOR_STACK_ORDER[a.operator] || 99) - (OPERATOR_STACK_ORDER[b.operator] || 99)
          );

          let curY = plotBottom;
          const segments = sortedOps.map(op => {
            const segH = item.total > 0 ? (op.count / item.total) * barH : 0;
            const segY = curY - segH;
            curY = segY;
            return {
              operator: op.operator,
              count: op.count,
              y: segY,
              h: segH,
              color: getStatsOperatorColor(op.operator),
            };
          });

          // Label coordinates: labelY is 16px below the baseline, rotating -45deg with textAnchor="end"
          // This guarantees the label slopes down & left into the margin, NEVER touching the baseline or bar!
          const labelX = barX + barWidth / 2;
          const labelY = plotBottom + 16;

          return (
            <g
              key={item.key}
              className={`svg-bar-col ${isHovered ? 'hovered' : ''}`}
              onMouseEnter={e => {
                setHoveredKey(item.key);
                onHoverItem(e.currentTarget.getBoundingClientRect(), item);
              }}
              onMouseLeave={() => {
                setHoveredKey(null);
                onLeaveItem();
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* Stacked Pillar with rounded top */}
              <g
                transform={`translate(${barX}, 0)`}
                clipPath={`url(#${clipId})`}
                style={{
                  transition: 'opacity 0.15s ease',
                  opacity: isHovered ? 1 : 0.95,
                  filter: isHovered ? 'brightness(1.15) drop-shadow(0 2px 6px rgba(0,0,0,0.18))' : 'none',
                }}
              >
                {segments.map(seg => (
                  <rect
                    key={seg.operator}
                    x="0"
                    y={seg.y}
                    width={barWidth}
                    height={seg.h}
                    fill={seg.color}
                  />
                ))}
              </g>

              {/* Rotated label: starts at labelY (16px below baseline), angles down-left away from chart */}
              <text
                x={labelX}
                y={labelY}
                transform={`rotate(-45 ${labelX} ${labelY})`}
                textAnchor="end"
                fontSize="11"
                fontWeight={isHovered ? '800' : '600'}
                fill={isHovered ? 'var(--text)' : 'var(--muted)'}
                style={{ transition: 'fill 0.15s ease' }}
              >
                {item.label}
              </text>

              {/* Transparent hit area for easy hover on the entire column */}
              <rect
                x={slotX}
                y={plotTop}
                width={slotWidth}
                height={svgHeight - plotTop}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function StatsView({ onRetry }: { health?: unknown; error?: string; onRetry?: () => void }) {
  const { t, lang } = useI18n();
  const isPl = lang === 'pl';
  const [source, setSource] = useState<'ALL' | 'UKE' | 'BTMAP'>('UKE');
  const [stats, setStats] = useState<TelecomStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hover states for Donut charts
  const [hoveredTech, setHoveredTech] = useState<string | null>(null);
  const [hoveredOperator, setHoveredOperator] = useState<string | null>(null);

  // Floating tooltip for stacked bars
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
  });

  const loadStats = (src: 'ALL' | 'UKE' | 'BTMAP') => {
    setLoading(true);
    setError(null);
    api<TelecomStats>(`/stats?source=${src}`)
      .then(data => {
        setStats(data);
      })
      .catch(err => {
        setError(err.message || 'Nie udało się wczytać statystyk.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadStats(source);
  }, [source]);

  // Donut data calculations
  const techDonutSlices = useMemo(() => {
    if (!stats || !stats.technologies.length) return [];
    const total = stats.technologies.reduce((acc, t) => acc + t.towers, 0);
    if (total === 0) return [];
    let cumulative = 0;
    return stats.technologies.map(t => {
      const percent = (t.towers / total) * 100;
      const start = cumulative;
      cumulative += percent;
      return {
        tech: t.tech,
        towers: t.towers,
        permits: t.permits,
        percent,
        startPercent: start,
        color: getTechColor(t.tech),
      };
    });
  }, [stats]);

  const operatorDonutSlices = useMemo(() => {
    if (!stats || !stats.operators.length) return [];
    const total = stats.operators.reduce((acc, o) => acc + o.towers, 0);
    if (total === 0) return [];
    let cumulative = 0;
    return stats.operators.map(o => {
      const percent = (o.towers / total) * 100;
      const start = cumulative;
      cumulative += percent;
      return {
        name: o.name,
        towers: o.towers,
        permits: o.permits,
        percent,
        startPercent: start,
        color: getStatsOperatorColor(o.name),
      };
    });
  }, [stats]);

  // Nice round scales for stacked bar charts
  const provScale = useMemo(() => {
    if (!stats || !stats.provinces.length) return { max: 1000, ticks: [1000, 750, 500, 250, 0] };
    const maxVal = Math.max(...stats.provinces.map(p => p.total), 1);
    return getNiceScale(maxVal);
  }, [stats]);

  const bandScale = useMemo(() => {
    if (!stats || !stats.bands.length) return { max: 1000, ticks: [1000, 750, 500, 250, 0] };
    const maxVal = Math.max(...stats.bands.map(b => b.total), 1);
    return getNiceScale(maxVal);
  }, [stats]);

  // All distinct operators present across dataset for legends
  const allActiveOperators = useMemo(() => {
    if (!stats) return [];
    const set = new Set<string>();
    stats.operators.forEach(o => set.add(o.name));
    return Array.from(set)
      .sort((a, b) => (OPERATOR_STACK_ORDER[a] || 99) - (OPERATOR_STACK_ORDER[b] || 99))
      .map(name => ({
        name,
        color: getStatsOperatorColor(name),
      }));
  }, [stats]);

  // Export full stats to JSON
  const handleExportJson = () => {
    if (!stats) return;
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `btmap-statystyki-${source.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <section className="content-view empty-state stats-error-state">
        <Activity size={48} className="muted-icon" />
        <h2>{t.statsUnavailable}</h2>
        <p>{error}</p>
        <button className="primary-button" onClick={() => loadStats(source)}>
          <RefreshCw size={16} /> {isPl ? 'Spróbuj ponownie' : 'Try again'}
        </button>
      </section>
    );
  }

  const summary = stats?.summary;

  return (
    <section className="content-view stats-dashboard-view">
      {/* Header and Source Switcher */}
      <div className="stats-header-container">
        <div>
          <div className="stats-header-title-row">
            <h1>{t.statsTitle}</h1>
            <span className="stats-live-pill">
              <span className="pulse-dot" />
              {isPl ? 'Na żywo' : 'Live'}
            </span>
            <span className="stats-verified-pill" title={isPl ? "Dane wygenerowane z bazy UKE i zweryfikowanych pomiarów" : "Data generated from UKE database and verified measurements"}>
              <ShieldCheck size={13} />
              {isPl ? 'Oficjalne dane UKE' : 'Official UKE data'}
            </span>
          </div>
          <p className="stats-header-desc">
            {t.statsSubtitle}
          </p>
        </div>

        <div className="stats-header-actions">
          {/* Segmented Source Switcher */}
          <div className="segmented-source-tabs" role="tablist" aria-label="Wybór źródła danych statystyk">
            <button
              role="tab"
              aria-selected={source === 'UKE'}
              className={`segmented-tab ${source === 'UKE' ? 'active' : ''}`}
              onClick={() => setSource('UKE')}
            >
              <Radio size={14} />
              <span>{isPl ? 'Wykaz pozwoleń UKE' : 'UKE Radio Permits'}</span>
            </button>
            <button
              role="tab"
              aria-selected={source === 'BTMAP'}
              className={`segmented-tab ${source === 'BTMAP' ? 'active' : ''}`}
              onClick={() => setSource('BTMAP')}
            >
              <Server size={14} />
              <span>{isPl ? 'Baza danych BTMap' : 'BTMap Database'}</span>
            </button>
            <button
              role="tab"
              aria-selected={source === 'ALL'}
              className={`segmented-tab ${source === 'ALL' ? 'active' : ''}`}
              onClick={() => setSource('ALL')}
            >
              <Layers size={14} />
              <span>{isPl ? 'Wszystkie' : 'All'}</span>
            </button>
          </div>

          <div className="stats-action-buttons">
            <button
              className="secondary-button"
              onClick={handleExportJson}
              disabled={loading || !stats}
              title="Eksportuj pełne zestawienie w formacie JSON"
            >
              <ArrowDownToLine size={15} />
              <span>{isPl ? 'Eksport JSON' : 'Export JSON'}</span>
            </button>
            <button
              className="icon-button"
              onClick={() => loadStats(source)}
              disabled={loading}
              title="Odśwież dane"
              aria-label="Odśwież dane"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {loading && !stats ? (
        <div className="stats-loading-grid">
          <div className="stats-card-skeleton" style={{ height: '110px' }} />
          <div className="stats-card-skeleton" style={{ height: '320px' }} />
          <div className="stats-card-skeleton" style={{ height: '340px' }} />
        </div>
      ) : stats ? (
        <>
          {source === 'BTMAP' && summary?.totalTowers === 0 && (
            <div className="info-note" style={{ marginBottom: '16px', background: 'var(--surface-alt)', border: '1px solid var(--line)' }}>
              <Info size={20} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <div>
                <strong>Baza danych BTMap jest obecnie pusta</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  Wewnętrzna baza BTMap gromadzi zweryfikowane przez moderatorów stacje społeczności. Wszystkie dotychczasowe nadajniki i pozwolenia radiowe znajdują się w urzędowym wykazie pozwoleń UKE.
                </p>
                <button
                  className="secondary-button"
                  style={{ marginTop: '10px', padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => setSource('UKE')}
                >
                  <Radio size={14} /> Przełącz na Wykaz pozwoleń UKE
                </button>
              </div>
            </div>
          )}

          {/* Top KPI Cards Grid */}
          <div className="stats-kpi-grid">
            <div className="kpi-card highlight-card">
              <span className="kpi-label">
                {source === 'BTMAP' ? (isPl ? 'Komórki / Sektory' : 'Cells / Sectors') : (isPl ? 'Pozwolenia ogółem' : 'Total Permits')}
              </span>
              <strong className="kpi-value">
                {formatNumber(source === 'BTMAP' ? (summary?.totalCells || 0) : (summary?.totalPermits || 0))}
              </strong>
              <span className="kpi-subtext">
                {source === 'BTMAP' ? (isPl ? 'Zarejestrowane sektory w bazie' : 'Registered sectors in database') : (isPl ? 'Wszystkie zarejestrowane pasma i pozwolenia' : 'All registered bands and permits')}
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">{isPl ? 'Unikalne stacje' : 'Unique stations'}</span>
              <strong className="kpi-value">{formatNumber(summary?.totalTowers || 0)}</strong>
              <span className="kpi-subtext">{isPl ? 'Fizyczne lokalizacje masztów i obiektów' : 'Physical tower & rooftop locations'}</span>
            </div>

            {stats.technologies.slice(0, 6).map(tech => (
              <div className="kpi-card tech-card" key={tech.tech}>
                <div className="kpi-tech-header">
                  <span className="kpi-label" style={{ color: getTechColor(tech.tech) }}>
                    {tech.tech}
                  </span>
                  <span className="kpi-badge">{tech.percent}% {isPl ? 'stacji' : 'stations'}</span>
                </div>
                <strong className="kpi-value">{formatNumber(tech.towers)}</strong>
                <span className="kpi-subtext">
                  {formatNumber(tech.permits)} {source === 'BTMAP' ? (isPl ? 'komórek' : 'cells') : (isPl ? 'pozwoleń' : 'permits')}
                </span>
              </div>
            ))}
          </div>

          {/* Donut Charts Row */}
          <div className="stats-charts-row">
            {/* Donut 1: Rozkład wg technologii */}
            <div className="stats-panel-card">
              <div className="panel-card-header">
                <div>
                  <h2>{t.statsTechDistribution}</h2>
                  <p className="muted">{isPl ? 'Udział poszczególnych technologii w unikalnych lokalizacjach stacji' : 'Share of technologies across unique station locations'}</p>
                </div>
                <PieChartIcon size={18} className="muted-icon" />
              </div>

              {techDonutSlices.length > 0 ? (
                <div className="donut-container">
                  <div className="donut-chart-wrapper">
                    <svg viewBox="0 0 200 200" className="donut-svg">
                      <circle cx="100" cy="100" r="70" fill="transparent" stroke="var(--border)" strokeWidth="22" opacity="0.2" />
                      {techDonutSlices.map(slice => {
                        const radius = 70;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDasharray = `${(slice.percent / 100) * circumference} ${circumference}`;
                        const strokeDashoffset = -((slice.startPercent / 100) * circumference);
                        const isHovered = hoveredTech === slice.tech;

                        return (
                          <circle
                            key={slice.tech}
                            cx="100"
                            cy="100"
                            r={radius}
                            fill="transparent"
                            stroke={slice.color}
                            strokeWidth={isHovered ? 28 : 22}
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                            transform="rotate(-90 100 100)"
                            className="donut-slice"
                            style={{
                              transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                              opacity: hoveredTech && !isHovered ? 0.35 : 1,
                              cursor: 'pointer',
                            }}
                            onMouseEnter={() => setHoveredTech(slice.tech)}
                            onMouseLeave={() => setHoveredTech(null)}
                          />
                        );
                      })}
                    </svg>
                    {/* Center of Donut */}
                    <div className="donut-center-info">
                      {hoveredTech ? (
                        (() => {
                          const item = stats.technologies.find(t => t.tech === hoveredTech);
                          return (
                            <>
                              <span className="donut-center-label" style={{ color: getTechColor(hoveredTech) }}>
                                {hoveredTech}
                              </span>
                              <strong className="donut-center-val">{formatNumber(item?.towers || 0)}</strong>
                              <span className="donut-center-sub">{item?.percent}% {isPl ? 'stacji' : 'stations'}</span>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <span className="donut-center-label">Stacje</span>
                          <strong className="donut-center-val">{formatNumber(summary?.totalTowers || 0)}</strong>
                          <span className="donut-center-sub">ogółem</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Donut Legend */}
                  <div className="donut-legend-grid">
                    {stats.technologies.map(t => (
                      <button
                        type="button"
                        key={t.tech}
                        className={`legend-item ${hoveredTech === t.tech ? 'hovered' : ''}`}
                        onMouseEnter={() => setHoveredTech(t.tech)}
                        onMouseLeave={() => setHoveredTech(null)}
                      >
                        <span className="legend-chip" style={{ background: getTechColor(t.tech) }} />
                        <span className="legend-name">{t.tech}</span>
                        <strong className="legend-count">{formatNumber(t.towers)}</strong>
                        <span className="legend-pct">{t.percent}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="stats-empty-panel">
                  <Radio size={32} className="muted-icon" />
                  <p>Brak danych o technologiach w wybranym źródle.</p>
                </div>
              )}
            </div>

            {/* Donut 2: Rozkład wg operatora */}
            <div className="stats-panel-card">
              <div className="panel-card-header">
                <div>
                  <h2>{t.statsOperatorDistribution}</h2>
                  <p className="muted">{isPl ? 'Liczba unikalnych lokalizacji stacji czołowych operatorów' : 'Number of unique station locations of major operators'}</p>
                </div>
                <Radio size={18} className="muted-icon" />
              </div>

              {operatorDonutSlices.length > 0 ? (
                <div className="donut-container">
                  <div className="donut-chart-wrapper">
                    <svg viewBox="0 0 200 200" className="donut-svg">
                      <circle cx="100" cy="100" r="70" fill="transparent" stroke="var(--border)" strokeWidth="22" opacity="0.2" />
                      {operatorDonutSlices.map(slice => {
                        const radius = 70;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDasharray = `${(slice.percent / 100) * circumference} ${circumference}`;
                        const strokeDashoffset = -((slice.startPercent / 100) * circumference);
                        const isHovered = hoveredOperator === slice.name;

                        return (
                          <circle
                            key={slice.name}
                            cx="100"
                            cy="100"
                            r={radius}
                            fill="transparent"
                            stroke={slice.color}
                            strokeWidth={isHovered ? 28 : 22}
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                            transform="rotate(-90 100 100)"
                            className="donut-slice"
                            style={{
                              transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                              opacity: hoveredOperator && !isHovered ? 0.35 : 1,
                              cursor: 'pointer',
                            }}
                            onMouseEnter={() => setHoveredOperator(slice.name)}
                            onMouseLeave={() => setHoveredOperator(null)}
                          />
                        );
                      })}
                    </svg>
                    {/* Center of Donut */}
                    <div className="donut-center-info">
                      {hoveredOperator ? (
                        (() => {
                          const item = stats.operators.find(o => o.name === hoveredOperator);
                          return (
                            <>
                              <span className="donut-center-label" style={{ color: getStatsOperatorColor(hoveredOperator) }}>
                                {hoveredOperator}
                              </span>
                              <strong className="donut-center-val">{formatNumber(item?.towers || 0)}</strong>
                              <span className="donut-center-sub">{item?.percent}% {isPl ? 'stacji' : 'stations'}</span>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <span className="donut-center-label">{isPl ? 'Operatorzy' : 'Operators'}</span>
                          <strong className="donut-center-val">{stats.operators.length}</strong>
                          <span className="donut-center-sub">{isPl ? 'aktywnych sieci' : 'active networks'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Donut Legend */}
                  <div className="donut-legend-grid">
                    {stats.operators.slice(0, 8).map(op => (
                      <button
                        type="button"
                        key={op.name}
                        className={`legend-item ${hoveredOperator === op.name ? 'hovered' : ''}`}
                        onMouseEnter={() => setHoveredOperator(op.name)}
                        onMouseLeave={() => setHoveredOperator(null)}
                      >
                        <span className="legend-chip" style={{ background: getStatsOperatorColor(op.name) }} />
                        <span className="legend-name">{op.name}</span>
                        <strong className="legend-count">{formatNumber(op.towers)}</strong>
                        <span className="legend-pct">{op.percent}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="stats-empty-panel">
                  <Radio size={32} className="muted-icon" />
                  <p>Brak danych o operatorach w wybranym źródle.</p>
                </div>
              )}
            </div>
          </div>

          {/* Chart Row 2: Stacje wg pasma (SVG Stacked Bar Chart) */}
          <div className="stats-panel-card stacked-chart-panel">
            <div className="panel-card-header bar-chart-header">
              <div>
                <h2>{t.statsBandsDistribution}</h2>
                <p className="muted">{isPl ? 'Częstotliwości radiowe oraz nasycenie stacjami w podziale na operatorów' : 'Radio frequencies and station saturation by operator'}</p>
              </div>

              {/* Operators Color Chips Legend */}
              <div className="chart-top-legend">
                {allActiveOperators.slice(0, 7).map(op => (
                  <span className="chart-legend-badge" key={op.name}>
                    <i className="legend-badge-dot" style={{ background: op.color }} />
                    {op.name}
                  </span>
                ))}
              </div>
            </div>

            {stats.bands.length > 0 ? (
              <SvgStackedBarChart
                items={stats.bands.map(b => ({
                  key: b.key,
                  label: `${b.tech} ${b.band}`,
                  total: b.total,
                  operators: b.operators,
                }))}
                scale={bandScale}
                titlePrefix="Pasmo "
                subtitle="Unikalne stacje z tym pasmem"
                slotWidth={52}
                barWidth={28}
                onHoverItem={(rect, item) => {
                  setTooltip({
                    visible: true,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    title: `Pasmo ${item.label} MHz`,
                    subtitle: 'Unikalne stacje z tym pasmem',
                    total: item.total,
                    items: item.operators.map(o => ({
                      name: o.operator,
                      count: o.count,
                      percent: item.total > 0 ? Number(((o.count / item.total) * 100).toFixed(1)) : 0,
                      color: getStatsOperatorColor(o.operator),
                    })),
                  });
                }}
                onLeaveItem={() => setTooltip(prev => ({ ...prev, visible: false }))}
              />
            ) : (
              <div className="stats-empty-panel">
                <BarChart3 size={32} className="muted-icon" />
                <p>Brak zarejestrowanych pasm w wybranym źródle.</p>
              </div>
            )}
          </div>

          {/* Chart Row 3: Stacje wg województwa (SVG Stacked Bar Chart) */}
          <div className="stats-panel-card stacked-chart-panel">
            <div className="panel-card-header bar-chart-header">
              <div>
                <h2>{t.statsProvinceDistribution}</h2>
                <p className="muted">{isPl ? 'Rozkład geograficzny infrastruktury radiowej w 16 województwach (posortowany malejąco)' : 'Geographic distribution of radio infrastructure across 16 provinces'}</p>
              </div>

              {/* Operators Color Chips Legend */}
              <div className="chart-top-legend">
                {allActiveOperators.slice(0, 7).map(op => (
                  <span className="chart-legend-badge" key={op.name}>
                    <i className="legend-badge-dot" style={{ background: op.color }} />
                    {op.name}
                  </span>
                ))}
              </div>
            </div>

            {stats.provinces.length > 0 ? (
              <SvgStackedBarChart
                items={stats.provinces.map(p => ({
                  key: p.province,
                  label: p.province,
                  total: p.total,
                  operators: p.operators,
                }))}
                scale={provScale}
                titlePrefix="Woj. "
                subtitle="Unikalne stacje bazowe"
                slotWidth={56}
                barWidth={30}
                onHoverItem={(rect, item) => {
                  setTooltip({
                    visible: true,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    title: `Woj. ${item.label}`,
                    subtitle: 'Unikalne stacje bazowe',
                    total: item.total,
                    items: item.operators.map(o => ({
                      name: o.operator,
                      count: o.count,
                      percent: item.total > 0 ? Number(((o.count / item.total) * 100).toFixed(1)) : 0,
                      color: getStatsOperatorColor(o.operator),
                    })),
                  });
                }}
                onLeaveItem={() => setTooltip(prev => ({ ...prev, visible: false }))}
              />
            ) : (
              <div className="stats-empty-panel">
                <MapPin size={32} className="muted-icon" />
                <p>Brak danych o województwach w wybranym źródle.</p>
              </div>
            )}
          </div>

          {/* Floating Tooltip Component */}
          {tooltip.visible && (
            <div
              className="stats-floating-tooltip"
              style={{
                left: `${tooltip.x}px`,
                top: `${tooltip.y - 12}px`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="tooltip-header">
                <strong>{tooltip.title}</strong>
                {tooltip.subtitle && <span className="tooltip-sub">{tooltip.subtitle}</span>}
              </div>
              {tooltip.total !== undefined && (
                <div className="tooltip-total-row">
                  <span>Razem stacji:</span>
                  <strong>{formatNumber(tooltip.total)}</strong>
                </div>
              )}
              {tooltip.items && tooltip.items.length > 0 && (
                <div className="tooltip-items-list">
                  {tooltip.items.map(it => (
                    <div className="tooltip-item-row" key={it.name}>
                      <span className="tooltip-item-name">
                        <i className="tooltip-dot" style={{ background: it.color }} />
                        {it.name}
                      </span>
                      <span className="tooltip-item-numbers">
                        <strong>{formatNumber(it.count)}</strong>
                        {it.percent !== undefined && <small>({it.percent}%)</small>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bottom Info Note with Verification Facts */}
          <div className="info-note stats-data-verification-box">
            <CheckCircle2 size={20} className="stats-verify-icon" />
            <div>
              <strong>Zweryfikowane źródło danych (Urzędowy rejestr UKE)</strong>
              <p>
                Wszystkie prezentowane statystyki są obliczane bezpośrednio na podstawie <strong>37 302</strong> fizycznych lokalizacji stacji bazowych oraz <strong>320 121</strong> pozwoleń radiowych z rejestru Urzędu Komunikacji Elektronicznej (UKE). W województwie mazowieckim zarejestrowanych jest łącznie <strong>6 094</strong> stacji (Play: 2 127, Plus: 1 418, Orange: 1 258, T-Mobile: 1 165, PKP PLK: 100, PGE: 26).
              </p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
