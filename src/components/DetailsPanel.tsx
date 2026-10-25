import { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  MapPin,
  Activity,
  Info,
  Signal,
  Database,
  Hash,
  Globe,
  Building2,
  Ruler,
  NotebookPen,
  Radio,
  ChevronDown,
  Plus,
  Mountain,
  Radar,
  Compass,
} from 'lucide-react';
import type { Tower, Operator, Band } from '../types';
import { cachedPemReports, freshPemReports, loadPemReports, pemSummary } from '../lib/pemCache';
import PemReportsDialog from './PemReportsDialog';
import PemReportList from './PemReportList';
import type { PemReportsResult } from '../../shared/pem';
import { operatorColor, towerTechs } from '../lib/constants';
import { useI18n } from '../lib/i18n';

const technologyNames: Record<string, string> = {
  '5G': '5G NR',
  LTE: '4G LTE',
  UMTS: '3G UMTS',
  GSM: '2G GSM',
  IOT: 'NB IoT',
  CDMA: 'CDMA',
};

type Props = {
  tower: Tower;
  onClose: () => void;
  onNotice: (message: string) => void;
  onOpenCreateStation?: (tower: Tower) => void;
  onOpenTerrainProfile?: (tower: Tower) => void;
  onOpenAreaEvaluation?: (coords: [number, number]) => void;
};

function extractFreq(bandStr: string): number {
  const m = String(bandStr || '').replace(/^[2345]g\b/i, '').match(/\d{3,4}/) || String(bandStr || '').match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function bandMeta(tech: string, bandStr: string) {
  const b = String(extractFreq(bandStr) || bandStr.replace(/\D/g, ''));
  const t = tech.toUpperCase();
  if (t === '5G') {
    if (b === '700') return { tag: 'n28', duplex: 'FDD', macro: 'macro' };
    if (b === '800') return { tag: 'n20', duplex: 'FDD', macro: 'macro' };
    if (b === '900') return { tag: 'n8', duplex: 'FDD', macro: 'macro' };
    if (b === '1800') return { tag: 'n3', duplex: 'FDD', macro: 'macro' };
    if (b === '2100') return { tag: 'n1', duplex: 'FDD', macro: 'macro' };
    if (b === '2600') return { tag: 'n38', duplex: 'TDD', macro: 'macro' };
    if (b === '3500' || b === '3600') return { tag: 'n78', duplex: 'TDD', macro: 'macro' };
    return { tag: `n${b}`, duplex: 'TDD', macro: 'macro' };
  }
  if (t === 'LTE') {
    if (b === '700') return { tag: 'b28', duplex: 'FDD', macro: 'macro' };
    if (b === '800') return { tag: 'b20', duplex: 'FDD', macro: 'macro' };
    if (b === '900') return { tag: 'b8', duplex: 'FDD', macro: 'macro' };
    if (b === '1800') return { tag: 'b3', duplex: 'FDD', macro: 'macro' };
    if (b === '2100') return { tag: 'b1', duplex: 'FDD', macro: 'macro' };
    if (b === '2600') return { tag: 'b7', duplex: 'FDD', macro: 'macro' };
    return { tag: `b${b}`, duplex: 'FDD', macro: 'macro' };
  }
  if (t === 'UMTS') {
    if (b === '900') return { tag: 'B8', duplex: 'FDD', macro: 'macro' };
    if (b === '2100') return { tag: 'B1', duplex: 'FDD', macro: 'macro' };
    return { tag: `B${b}`, duplex: 'FDD', macro: 'macro' };
  }
  if (t === 'GSM' || t === 'GSM-R') {
    if (b === '900') return { tag: 'GSM900', duplex: 'FDD', macro: 'macro' };
    if (b === '1800') return { tag: 'DCS1800', duplex: 'FDD', macro: 'macro' };
    return { tag: `GSM${b}`, duplex: 'FDD', macro: 'macro' };
  }
  return { tag: b, duplex: 'FDD', macro: 'macro' };
}

function techGen(tech: string) {
  const t = tech.toUpperCase();
  if (t === '5G') return { gen: '5G', label: '5G NR' };
  if (t === 'LTE') return { gen: '4G', label: 'LTE' };
  if (t === 'UMTS') return { gen: '3G', label: 'UMTS' };
  if (t === 'GSM' || t === 'GSM-R') return { gen: '2G', label: 'GSM' };
  return { gen: t, label: t };
}

function CellDetailsBlock({ op, onNotice }: { op: Operator; onNotice: (msg: string) => void }) {
  const { t, lang } = useI18n();
  const isPl = lang === 'pl';
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const bands = op.bands || [];
  if (!bands.length) return null;

  const techOrder = ['5G', 'LTE', 'UMTS', 'GSM', 'GSM-R', 'CDMA', 'IOT'];
  const grouped = new Map<string, Band[]>();
  for (const b of bands) {
    const t = b.tech === 'NR' ? '5G' : b.tech;
    const list = grouped.get(t) || [];
    list.push(b);
    grouped.set(t, list);
  }

  const sortedTechs = [...grouped.keys()].sort((a, b) => {
    const ia = techOrder.indexOf(a);
    const ib = techOrder.indexOf(b);
    return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99);
  });

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      onNotice(`Skopiowano ID: ${id}`);
    }
  };

  return (
    <div className="cell-operator-group">
      <div className="cell-operator-group-header">
        <i className="operator-dot" style={{ background: operatorColor(op.name) }} />
        <span>{op.name}</span>
        {op.stationIds?.length ? (
          <span className="station-operator-id">· ID: {op.stationIds.join(', ')}</span>
        ) : null}
      </div>
      {sortedTechs.map(tech => {
        const rawBands = grouped.get(tech) || [];
        const techBands = rawBands.slice().sort((a, b) => {
          const fa = extractFreq(a.band);
          const fb = extractFreq(b.band);
          if (fa !== fb) return fa - fb;
          return a.band.localeCompare(b.band);
        });
        const isCollapsed = collapsed[tech] === true;
        const gen = techGen(tech);
        const blockId = `${op.name}-${tech}`;

        return (
          <div key={blockId} className="cell-block">
            <button
              type="button"
              className="cell-block-header"
              onClick={() => setCollapsed(prev => ({ ...prev, [tech]: !prev[tech] }))}
              aria-expanded={!isCollapsed}
            >
              <div className="cell-block-header-left">
                <span className="cell-tech-pill">
                  <span className="cell-gen-badge">{gen.gen}</span>
                  <strong>{gen.label}</strong>
                </span>
                <span className="cell-tech-count">
                  ({techBands.length} {techBands.length === 1 ? (isPl ? 'pasmo' : 'band') : techBands.length < 5 ? (isPl ? 'pasma' : 'bands') : (isPl ? 'pasm' : 'bands')})
                </span>
                {op.stationIds?.[0] && (
                  <span
                    className="cell-tag"
                    onClick={e => {
                      e.stopPropagation();
                      void copyId(op.stationIds![0]);
                    }}
                    title={isPl ? "Kopiuj ID stacji" : "Copy station ID"}
                  >
                    <span>ID</span>
                    <strong>{op.stationIds[0]}</strong>
                    {copiedId === op.stationIds[0] ? <Check size={12} /> : <Copy size={12} />}
                  </span>
                )}
              </div>
              <ChevronDown size={17} className={`cell-chevron ${isCollapsed ? 'rotated' : ''}`} />
            </button>

            {!isCollapsed && (
              <div className="cell-table-wrap">
                <table className="cell-table">
                  <thead>
                    <tr>
                      <th className="cell-col-pasmo">{t.detailsColBand}</th>
                      <th className="cell-col-zastosowanie">{isPl ? 'Zastosowanie' : 'Application'}</th>
                      <th className="cell-col-details">{isPl ? 'Szczegóły pozwolenia / ECI / PCI' : 'Permit details / ECI / PCI'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techBands.map((b, idx) => {
                      const meta = bandMeta(tech, b.band);
                      const permitNo = b.permit?.match(/^([^\[-]+)/)?.[1]?.trim() || (b.permit || '—');
                      const permitType = b.permit?.match(/\[([^\]]+)\]/)?.[1] || null;
                      const expMatch = b.permit?.match(/expires\s+(\d{4}-\d{2}-\d{2})/);
                      const expiryDate = expMatch
                        ? expMatch[1].startsWith('2099')
                          ? (isPl ? 'Bezterminowo' : 'Indefinite')
                          : expMatch[1]
                        : null;

                      return (
                        <tr key={idx}>
                          <td className="cell-col-pasmo">
                            <strong className="cell-pasmo-main">{b.band}</strong>
                            {b.azimuth != null && (
                              <span className="cell-azimuth-tag" title="Azymut sektora">{b.azimuth}°</span>
                            )}
                          </td>
                          <td className="cell-col-zastosowanie">
                            <span className="cell-pasmo-sub">
                              {meta.tag} | {meta.duplex} | {meta.macro}
                            </span>
                          </td>
                          <td className="cell-col-details">
                            <div className="cell-permit-details">
                              <div className="cell-permit-primary">
                                <span className="cell-permit-num" title={b.permit || permitNo}>
                                  {permitNo}
                                </span>
                                {permitType && (
                                  <span className="cell-badge-type">[{permitType}]</span>
                                )}
                                {b.status && (
                                  <span className="cell-badge-status">{b.status}</span>
                                )}
                              </div>
                              {expiryDate && (
                                <span className="cell-expiry">{isPl ? 'Ważność:' : 'Expires:'} {expiryDate}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DetailsPanel({
  tower,
  onClose,
  onNotice,
  onOpenCreateStation,
  onOpenTerrainProfile,
  onOpenAreaEvaluation,
}: Props) {
  const { t, lang } = useI18n();
  const isPl = lang === 'pl';
  const [operator, setOperator] = useState(0);
  const [reportOpen, setReportOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'gps' | null>(null);

  const pemOperator = tower.operators[operator]?.name || '';
  const [reportData, setReportData] = useState<{ towerId: string; operator: string; result: PemReportsResult | null }>(
    () => ({ towerId: tower.id, operator: pemOperator, result: cachedPemReports(tower, pemOperator) })
  );
  const reports =
    reportData.towerId === tower.id && reportData.operator === pemOperator
      ? reportData.result
      : cachedPemReports(tower, pemOperator);
  const [reportLoading, setReportLoading] = useState(() => !cachedPemReports(tower, pemOperator));
  const [reportError, setReportError] = useState('');
  const [reportRetry, setReportRetry] = useState(0);

  useEffect(() => {
    setOperator(0);
    setReportOpen(null);
    setCopied(null);
  }, [tower.id]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saved = cachedPemReports(tower, pemOperator);
    setReportData({ towerId: tower.id, operator: pemOperator, result: saved });
    setReportError('');
    setReportLoading(!saved);

    const load = () =>
      loadPemReports(tower, pemOperator, reportRetry > 0)
        .then(result => {
          if (!active) return;
          setReportData({ towerId: tower.id, operator: pemOperator, result });
          if (!freshPemReports(result)) timer = setTimeout(load, 10000);
        })
        .catch(e => {
          if (active) setReportError(e.name === 'TimeoutError' ? 'SI2PEM odpowiada zbyt długo.' : e.message);
        })
        .finally(() => {
          if (active) setReportLoading(false);
        });

    if (!saved || !freshPemReports(saved) || reportRetry > 0) void load();
    else setReportLoading(false);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tower.id, pemOperator, reportRetry]);

  useEffect(() => setReportOpen(null), [tower.id, pemOperator]);

  const summary = pemSummary(tower, pemOperator);
  const reportCount = reports?.reportCount ?? summary?.count;
  const reportPartial = reports?.partial ?? summary?.partial;
  const coordinates = `${tower.lat.toFixed(6)}, ${tower.lng.toFixed(6)}`;

  const copy = async (kind: 'link' | 'gps') => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('station', tower.id);
      await navigator.clipboard.writeText(kind === 'gps' ? coordinates : url.toString());
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      onNotice(kind === 'gps' ? 'Nie udało się skopiować współrzędnych.' : 'Nie udało się skopiować linku.');
    }
  };

  const hasAnyBands = tower.operators.some(op => op.bands && op.bands.length > 0);

  return (
    <aside className="details-panel station-sheet" aria-labelledby="station-sheet-title">
      <header className="station-sheet-header">
        <div className="station-sheet-header-top">
          <div className="station-sheet-identity">
            <span className="station-sheet-brands">
              {tower.operators.map(item => (
                <span key={item.name}>
                  <i style={{ background: operatorColor(item.name) }} />
                  {item.name}
                </span>
              ))}
            </span>
            <span className="station-sheet-id">
              {tower.operators.length > 1
                ? tower.operators.map(o => o.stationIds?.[0] || tower.stationId).filter(Boolean).join(' · ')
                : tower.stationId || tower.operators[0]?.stationIds?.[0] || tower.id}
            </span>
            <span className="station-sheet-source">
              <Database size={12} aria-hidden="true" />
              {tower.source === 'BTMAP' ? t.detailsSourceBtmap : t.detailsSourceUke}
            </span>
            {tower.operators.some(o => o.name === 'Orange' || o.name === 'T-Mobile') && (
              <span className="station-networks-badge" title="Stacja współdzielona w ramach sojuszu NetWorkS! (Orange + T-Mobile)">
                N! NetWorkS!
              </span>
            )}
          </div>

          {/* Action buttons on top right */}
          <div className="station-sheet-actions">
            {onOpenAreaEvaluation && (
              <button
                type="button"
                className="header-profile-btn"
                onClick={() => onOpenAreaEvaluation([tower.lat, tower.lng])}
                title="Audyt i ocena 4 operatorów w tej lokalizacji (maks. 3.0 km²)"
                aria-label="Audyt i ocena 4 operatorów w tej lokalizacji"
              >
                <Radar size={14} />
                <span>{t.detailsAudit}</span>
              </button>
            )}
            {onOpenTerrainProfile && (
              <button
                type="button"
                className="header-profile-btn"
                onClick={() => onOpenTerrainProfile(tower)}
                title="Profil terenu i widoczność optyczna (Line-of-Sight)"
                aria-label="Profil terenu i widoczność optyczna"
              >
                <Mountain size={14} />
                <span>{t.detailsTerrainProfile}</span>
              </button>
            )}
            {onOpenCreateStation && (
              <button
                type="button"
                className="header-create-station-btn"
                onClick={() => onOpenCreateStation(tower)}
                title="Zgłoś aktualizację lub edycję stacji w bazie BTMap"
                aria-label="Zgłoś aktualizację lub edycję stacji w bazie BTMap"
              >
                <Plus size={14} />
                <span>{tower.source === 'BTMAP' ? t.detailsEditStation : t.detailsCreateStation}</span>
              </button>
            )}
            <button
              className="icon-button"
              onClick={() => void copy('link')}
              aria-label={copied === 'link' ? t.detailsLinkCopied : t.detailsCopyLink}
              title={t.detailsCopyLink}
            >
              {copied === 'link' ? <Check size={17} /> : <Copy size={17} />}
            </button>
            <button
              className="icon-button"
              onClick={onClose}
              aria-label={t.detailsCloseAria}
              title="Zamknij"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <h2 id="station-sheet-title">{tower.address || 'Stacja bazowa'}</h2>
        <div className="station-sheet-meta">
          <span>
            <MapPin size={13} aria-hidden="true" />
            {tower.province || 'Polska'}
          </span>
          {tower.mastType && (
            <span>
              <Building2 size={13} aria-hidden="true" />
              {tower.mastType}
            </span>
          )}
        </div>
        <div className="station-sheet-techs" aria-label="Technologie na stacji">
          {towerTechs(tower).map(t => (
            <span key={t}>{technologyNames[t] || t}</span>
          ))}
          {tower.azimuths && tower.azimuths.length > 0 && (
            <span className="station-azimuths-chip" title="Kierunki sektorów anten nadawczych">
              <Compass size={11} aria-hidden="true" />
              {tower.azimuths.map(a => `${a}°`).join(' · ')}
            </span>
          )}
        </div>
        <span className="sr-only" role="status">
          {copied === 'link' ? t.detailsLinkCopied : copied === 'gps' ? t.detailsGpsCopied : ''}
        </span>
      </header>

      {/* Main scrollable body with facts and bands */}
      <div className="station-sheet-scroll">
        <dl className="station-facts">
          <div>
            <dt>
              <MapPin size={16} />
              {t.detailsCoordinates}
            </dt>
            <dd className="station-gps">
              <span>{coordinates}</span>
              <button
                className="icon-button"
                onClick={() => void copy('gps')}
                aria-label={copied === 'gps' ? t.detailsGpsCopied : t.detailsCopyGps}
              >
                {copied === 'gps' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </dd>
          </div>
          <div>
            <dt>
              <Globe size={16} />
              {t.detailsProvince}
            </dt>
            <dd>{tower.province || (isPl ? 'Brak danych' : 'No data')}</dd>
          </div>
          <div>
            <dt>
              <Hash size={16} />
              {t.detailsStationId}
            </dt>
            <dd>
              {tower.operators.length > 1 && tower.operators.some(o => o.stationIds?.length)
                ? tower.operators
                    .map(o => `${o.name}: ${o.stationIds?.join(', ') || '—'}`)
                    .join(' · ')
                : tower.operators[0]?.stationIds?.join(', ') || tower.stationId || tower.id}
            </dd>
          </div>
          <div className="station-report-fact">
            <dt>
              <Activity size={16} />
              {isPl ? 'Raporty PEM' : 'PEM Reports'}
            </dt>
            <dd>
              {tower.operators.length > 1 && (
                <div className="pem-operator-picker" aria-label="Raporty PEM według operatora">
                  {tower.operators.map((item, index) => {
                    const count = pemSummary(tower, item.name)?.count;
                    return (
                      <button
                        key={item.name}
                        className={index === operator ? 'selected' : ''}
                        onClick={() => setOperator(index)}
                        aria-pressed={index === operator}
                        aria-label={`${item.name}, ${count === undefined ? 'liczba raportów nieznana' : `${count} raportów PDF`}`}
                      >
                        <i className="operator-dot" style={{ background: operatorColor(item.name) }} />
                        <span>{item.name}</span>
                        <strong>{count ?? '—'}</strong>
                      </button>
                    );
                  })}
                </div>
              )}
              <PemReportList
                key={`${tower.id}:${pemOperator}`}
                result={reports}
                count={reportCount}
                partial={reportPartial}
                loading={reportLoading}
                error={reportError}
                onRetry={() => setReportRetry(n => n + 1)}
                onSelect={report => setReportOpen(report.id)}
              />
            </dd>
          </div>
          {tower.height != null && tower.height > 0 && (
            <div>
              <dt>
                <Ruler size={16} />
                {t.detailsColHeight}
              </dt>
              <dd>{tower.height} m</dd>
            </div>
          )}
        </dl>

        {/* Szczegóły komórek i pasm UKE */}
        {hasAnyBands && (
          <section className="cell-details-section" aria-label="Szczegóły komórek i pasm">
            <div className="cell-details-heading">
              <Radio size={14} aria-hidden="true" />
              <span>{t.detailsBandsAndCells}</span>
            </div>
            {tower.operators.map(op => (
              <CellDetailsBlock key={op.name} op={op} onNotice={onNotice} />
            ))}
          </section>
        )}

        {tower.notes && (
          <section className="station-sheet-notes">
            <NotebookPen size={17} />
            <div>
              <h3>{t.detailsStationNotes}</h3>
              <p>{tower.notes}</p>
            </div>
          </section>
        )}

        <p className="station-data-note">
          <Info size={15} />
          <span>{t.detailsPermitNotice}</span>
        </p>
      </div>

      {reportOpen && reports && (
        <PemReportsDialog
          key={`${tower.id}:${pemOperator}`}
          tower={tower}
          operator={pemOperator}
          reports={reports.reports.filter(r => r.kind === 'pdf')}
          initialReportId={reportOpen}
          onClose={() => setReportOpen(null)}
        />
      )}
    </aside>
  );
}
