import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Radar,
  Crosshair,
  CheckCircle2,
  AlertTriangle,
  Mountain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../lib/api';
import type { AreaEvaluationResult, OperatorEvaluation } from '../types';
import type { Tower } from '../types';
import { useI18n } from '../lib/i18n';

interface Props {
  targetCoords: [number, number];
  radiusM: number;
  onRadiusChange: (r: number) => void;
  onPickOnMap: () => void;
  onClose: () => void;
  onOpenTerrainProfile?: (tower: Tower) => void;
}

const OP_COLORS: Record<string, string> = {
  Orange: '#ff7900',
  Play: '#8b5cf6',
  Plus: '#00a651',
  'T-Mobile': '#e20074',
};

function formatDist(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '—';
  if (km < 1.0) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(2)} km`;
}

export default function AreaEvaluationDialog({
  targetCoords,
  radiusM,
  onRadiusChange,
  onPickOnMap,
  onClose,
  onOpenTerrainProfile,
}: Props) {
  const { lang } = useI18n();
  const isEn = lang === 'en';

  const presets = useMemo(() => [
    { label: isEn ? 'Building' : 'Budynek', radius: 150, area: '0.07 km²' },
    { label: isEn ? 'Estate' : 'Osiedle', radius: 400, area: '0.50 km²' },
    { label: isEn ? 'Area' : 'Okolica', radius: 700, area: '1.54 km²' },
    { label: isEn ? 'Max. 3 km²' : 'Maks. 3 km²', radius: 977, area: '3.00 km²' },
  ], [isEn]);

  const [data, setData] = useState<AreaEvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedOpName, setSelectedOpName] = useState<string | null>(null);

  const areaKm2 = useMemo(() => {
    return Math.min(3.0, (Math.PI * Math.pow(radiusM, 2)) / 1_000_000);
  }, [radiusM]);

  // Fetch evaluation when target coordinates or radius changes
  useEffect(() => {
    let active = true;
    const [lat, lng] = targetCoords;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      api<AreaEvaluationResult>(
        `/area-evaluation?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&radiusM=${Math.round(radiusM)}`,
        { signal: controller.signal }
      )
        .then(res => {
          if (!active) return;
          setData(res);
          // Default selection to winner operator
          if (res?.bestOperator) {
            setSelectedOpName(prev => prev || res.bestOperator);
          }
          setLoading(false);
        })
        .catch(err => {
          if (!active || err.name === 'AbortError') return;
          setError(err.message || (isEn ? 'Failed to perform operator evaluation.' : 'Nie udało się przeprowadzić oceny operatorów.'));
          setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [targetCoords[0], targetCoords[1], radiusM, isEn]);

  const handleLaunchProfile = useCallback(
    (op: OperatorEvaluation) => {
      if (!op.servingStation || !onOpenTerrainProfile) return;
      const s = op.servingStation;
      const dummyTower: Tower = {
        id: s.id,
        stationId: s.stationId,
        lat: 0,
        lng: 0,
        address: s.address,
        province: '',
        source: 'BTMAP',
        operators: [
          {
            name: s.operator,
            stationIds: [s.stationId],
            bands: s.bands.map(b => ({ tech: 'LTE', band: b })),
          },
        ],
      };

      // Fetch the actual tower object from API to get precise coordinates
      api<Tower>(`/towers/${encodeURIComponent(s.id)}`)
        .then(t => onOpenTerrainProfile(t))
        .catch(() => onOpenTerrainProfile(dummyTower));
    },
    [onOpenTerrainProfile]
  );

  const selectedOp = useMemo(() => {
    if (!data) return null;
    return (
      data.operators.find(o => o.operator === selectedOpName) ||
      data.operators[0] ||
      null
    );
  }, [data, selectedOpName]);

  const breakdown = selectedOp
    ? [
        { key: 'terrain', label: isEn ? 'Terrain & line of sight' : 'Teren i widoczność', value: selectedOp.scoreBreakdown.terrainLos, max: 30 },
        { key: 'bands', label: isEn ? 'Bands' : 'Pasma', value: selectedOp.scoreBreakdown.spectrumBands, max: 30 },
        { key: 'sector', label: isEn ? 'Sector direction' : 'Kierunek sektora', value: selectedOp.scoreBreakdown.sectorAlignment, max: 20 },
        { key: 'infra', label: isEn ? 'Mast & SI2PEM' : 'Maszt i SI2PEM', value: selectedOp.scoreBreakdown.infrastructure, max: 20 },
      ]
    : [];
  const isRated = (op: OperatorEvaluation) => op.rated !== false && Boolean(op.servingStation);
  const partnerOf = (op: OperatorEvaluation) => op.servingStation?.networksPartner || (op.operator === 'Orange' ? 'T-Mobile' : 'Orange');

  return (
    <div className={`ae-dialog-dock ae-flat ${isMinimized ? 'is-minimized' : ''}`} role="dialog" aria-label={isEn ? 'Operator coverage audit' : 'Audyt zasięgu operatorów'}>
      <header className="ae-header">
        <div className="ae-hd">
          <span className="ae-hd-title">
            <Radar size={15} />
            {isEn ? 'Coverage audit' : 'Audyt zasięgu'}
          </span>
          <span className="ae-hd-sub">
            {targetCoords[0].toFixed(5)}, {targetCoords[1].toFixed(5)} · r = {Math.round(radiusM)} m
          </span>
        </div>
        <div className="ae-header-actions">
          <button type="button" className="ae-btn-outline" onClick={onPickOnMap} title={isEn ? 'Pick another point on the map' : 'Wskaż inny punkt na mapie'}>
            <Crosshair size={13} />
            <span>{isEn ? 'Change point' : 'Zmień punkt'}</span>
          </button>
          <button
            type="button"
            className="ae-icon-btn"
            title={isMinimized ? (isEn ? 'Expand panel' : 'Rozwiń panel') : (isEn ? 'Collapse panel' : 'Zwiń panel')}
            aria-label={isMinimized ? (isEn ? 'Expand panel' : 'Rozwiń panel') : (isEn ? 'Collapse panel' : 'Zwiń panel')}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          <button type="button" className="ae-icon-btn" title={isEn ? 'Close audit' : 'Zamknij audyt'} aria-label={isEn ? 'Close audit' : 'Zamknij audyt'} onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>

      {!isMinimized && (
        <div className="ae-content">
          {/* Area */}
          <section className="ae-group">
            <div className="ae-group-head">
              <span className="ae-group-title">{isEn ? 'Area' : 'Obszar'}</span>
              <span className="ae-group-meta">{areaKm2.toFixed(2).replace('.', ',')} km²</span>
            </div>
            <div className="ae-presets" role="group" aria-label={isEn ? 'Area size' : 'Wielkość obszaru'}>
              {presets.map(p => {
                const isActive = Math.abs(radiusM - p.radius) < 25;
                return (
                  <button key={p.radius} type="button" className={isActive ? 'active' : ''} aria-pressed={isActive} onClick={() => onRadiusChange(p.radius)}>
                    {p.label}
                    <small>{p.radius} m</small>
                  </button>
                );
              })}
            </div>
            <label className="ae-slider">
              <span className="ae-visually-hidden">{isEn ? 'Area radius' : 'Promień obszaru'}</span>
              <input type="range" min="80" max="977" step="10" value={Math.round(radiusM)} onChange={e => onRadiusChange(Number(e.target.value))} />
              <output>{Math.round(radiusM)} m</output>
            </label>
          </section>

          {loading ? (
            <div className="ae-state">
              <span className="ae-state-ring"><Radar size={18} className="ae-spin-slow" /></span>
              <strong>{isEn ? 'Evaluating 4 operators…' : 'Ocenianie 4 operatorów…'}</strong>
              <span>{isEn ? 'UKE stations nearby, sectors, bands, terrain and SI2PEM reports' : 'Stacje UKE w pobliżu, sektory, pasma, teren i raporty SI2PEM'}</span>
            </div>
          ) : error ? (
            <div className="ae-state is-error">
              <AlertTriangle size={18} />
              <strong>{error}</strong>
              <button type="button" className="ae-btn-outline" onClick={() => onRadiusChange(radiusM)}>
                {isEn ? 'Try again' : 'Spróbuj ponownie'}
              </button>
            </div>
          ) : data ? (
            <>
              {/* Ranking */}
              <section className="ae-group">
                <div className="ae-group-head">
                  <span className="ae-group-title">{isEn ? 'Ranking' : 'Ranking'}</span>
                  <span className="ae-group-meta">{isEn ? 'select an operator for details' : 'wybierz operatora, aby zobaczyć szczegóły'}</span>
                </div>
                <ol className="ae-rank">
                  {data.operators.map(op => {
                    const isSelected = selectedOp?.operator === op.operator;
                    const s = op.servingStation;
                    const rated = isRated(op);
                    const facts = s
                      ? [
                          s.hasCband5G ? '5G 3,6 GHz' : null,
                          s.losKnown === false ? (isEn ? 'LOS unknown' : 'LOS nieznany') : s.isLosClear ? (isEn ? 'LOS clear' : 'LOS czysty') : `LOS −${s.obstructionM.toFixed(1).replace('.', ',')} m`,
                          s.sectorKnown === false ? null : `${isEn ? 'sector' : 'sektor'} ${s.bestSectorAzimuth}° (${s.sectorDeviationDeg.toFixed(0)}°)`,
                          s.isNetworks ? 'NetWorkS!' : null,
                          s.hasSi2pem ? 'SI2PEM' : null,
                        ].filter(Boolean)
                      : [];
                    return (
                      <li key={op.operator}>
                        <button
                          type="button"
                          className={`ae-rank-row ${isSelected ? 'is-selected' : ''} ${rated ? '' : 'is-unrated'}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedOpName(op.operator)}
                          title={s?.isNetworks ? (isEn ? `Station shared via NetWorkS! with ${partnerOf(op)}` : `Stacja współdzielona w NetWorkS! z ${partnerOf(op)}`) : undefined}
                        >
                          <span className="ae-rank-no">{rated ? op.rank : '–'}</span>
                          <span className="ae-rank-main">
                            <span className="ae-rank-op">
                              <i style={{ background: OP_COLORS[op.operator] || '#94a3b8' }} aria-hidden="true" />
                              {op.operator}
                              {op.isWinner && <span className="ae-rank-best">{isEn ? 'best' : 'najlepszy'}</span>}
                            </span>
                            <span className="ae-rank-sub">
                              {s
                                ? `${s.stationId || s.id} · ${formatDist(s.distanceKm)}${facts.length ? ` · ${facts.join(' · ')}` : ''}`
                                : (isEn ? 'No UKE-registered station within 7.5 km' : 'Brak stacji z wykazu UKE w promieniu 7,5 km')}
                            </span>
                          </span>
                          {rated ? (
                            <span className="ae-rank-score">
                              <span className="ae-rank-bar" aria-hidden="true"><span style={{ width: `${op.score}%` }} /></span>
                              <b>{op.score}</b>
                              <span className={`ae-grade grade-${op.grade[0]}`}>{op.grade}</span>
                            </span>
                          ) : (
                            <span className="ae-rank-none">{isEn ? 'not rated' : 'brak oceny'}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {/* Details of the selected operator */}
              {selectedOp && (
                <section className="ae-group ae-detail">
                  <div className="ae-detail-head">
                    <span className="ae-detail-title">
                      <i style={{ background: OP_COLORS[selectedOp.operator] || '#94a3b8' }} aria-hidden="true" />
                      {selectedOp.operator}
                      {isRated(selectedOp) && (
                        <span className="ae-detail-score">
                          {selectedOp.score}/100 · {isEn ? 'grade' : 'ocena'} <span className={`ae-grade grade-${selectedOp.grade[0]}`}>{selectedOp.grade}</span>
                        </span>
                      )}
                    </span>
                    {selectedOp.servingStation && onOpenTerrainProfile && (
                      <button type="button" className="ae-btn-outline" onClick={() => handleLaunchProfile(selectedOp)} title={isEn ? 'Open the LiDAR terrain profile from this station' : 'Otwórz profil terenu LiDAR z tej stacji'}>
                        <Mountain size={13} />
                        <span>{isEn ? 'Terrain profile' : 'Profil terenu'}</span>
                      </button>
                    )}
                  </div>

                  {selectedOp.verdict && <p className="ae-verdict">{selectedOp.verdict}</p>}

                  {selectedOp.servingStation && (() => {
                    const s = selectedOp.servingStation!;
                    const rows: Array<[string, React.ReactNode, string?]> = [
                      [isEn ? 'Station' : 'Stacja', s.stationId || s.id],
                      [isEn ? 'Distance' : 'Odległość', formatDist(s.distanceKm)],
                      [isEn ? 'Antenna height' : 'Wysokość anten', s.heightKnown === false ? (isEn ? 'not in UKE data' : 'brak w danych UKE') : `${String(s.antennaHeightM).replace('.', ',')} m n.p.t.`],
                      [isEn ? 'Sector' : 'Sektor', s.sectorKnown === false ? (isEn ? 'no data' : 'brak danych') : `${s.bestSectorAzimuth}° (${isEn ? 'off by' : 'odchylenie'} ${s.sectorDeviationDeg.toFixed(1).replace('.', ',')}°)`],
                      [isEn ? 'Line of sight' : 'Widoczność', s.losKnown === false ? (isEn ? 'not checked' : 'nie sprawdzono') : s.isLosClear ? (isEn ? 'clear' : 'czysta') : `${isEn ? 'obstructed' : 'przesłonięta'} ${s.obstructionM.toFixed(1).replace('.', ',')} m`, s.losKnown === false ? '' : s.isLosClear ? 'is-ok' : 'is-warn'],
                      ['5G C-Band', s.hasCband5G ? '3600 MHz (n78)' : (isEn ? 'none' : 'brak')],
                    ];
                    if (s.isNetworks) rows.push(['NetWorkS!', `${isEn ? 'shared with' : 'współdzielona z'} ${partnerOf(selectedOp)}`]);
                    return (
                      <dl className="ae-kv">
                        {rows.map(([k, v, tone]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd className={tone || ''} title={k === (isEn ? 'Station' : 'Stacja') ? s.address : undefined}>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()}

                  {isRated(selectedOp) && (
                    <div className="ae-breakdown">
                      {breakdown.map(b => (
                        <div key={b.key} className="ae-breakdown-row">
                          <span>{b.label}</span>
                          <span className="ae-breakdown-track" aria-hidden="true"><span style={{ width: `${(b.value / b.max) * 100}%` }} /></span>
                          <b>{b.value}<small>/{b.max}</small></b>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedOp.pros.length > 0 && (
                    <div className="ae-facts">
                      <span className="ae-group-title">{isEn ? 'In favour' : 'Na plus'}</span>
                      <ul>
                        {selectedOp.pros.map((pro, idx) => (
                          <li key={idx} className="is-pro"><CheckCircle2 size={13} /><span>{pro}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedOp.cons.length > 0 && (
                    <div className="ae-facts">
                      <span className="ae-group-title">{isEn ? 'Against' : 'Na minus'}</span>
                      <ul>
                        {selectedOp.cons.map((con, idx) => (
                          <li key={idx} className="is-con"><AlertTriangle size={13} /><span>{con}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="ae-sources">
                    <span className="ae-src-badge">UKE + SI2PEM</span>
                    <span>
                      {(() => {
                        const total = selectedOp.stationsCount ?? selectedOp.si2pemStationsCount + selectedOp.unverifiedStationsCount;
                        const few = total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 12 || total % 100 > 14);
                        return isEn
                          ? `${total} UKE stations within 7.5 km · ${selectedOp.si2pemStationsCount} with an SI2PEM report`
                          : `${total} ${total === 1 ? 'stacja' : few ? 'stacje' : 'stacji'} UKE w promieniu 7,5 km · ${selectedOp.si2pemStationsCount} z raportem SI2PEM`;
                      })()}
                    </span>
                  </p>
                </section>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
