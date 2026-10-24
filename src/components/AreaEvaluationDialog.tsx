import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Radar,
  Trophy,
  ChevronDown,
  ChevronUp,
  Crosshair,
  CheckCircle2,
  AlertTriangle,
  Radio,
  SlidersHorizontal,
  Compass,
  Mountain,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Maximize2,
  Minimize2,
  MapPin,
  TowerControl,
} from 'lucide-react';
import { api } from '../lib/api';
import type { AreaEvaluationResult, OperatorEvaluation } from '../../server/areaEvaluation';
import type { Tower } from '../types';

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

const PRESETS = [
  { label: 'Budynek', radius: 150, area: '0.07 km²' },
  { label: 'Osiedle', radius: 400, area: '0.50 km²' },
  { label: 'Okolica', radius: 700, area: '1.54 km²' },
  { label: 'Maks. 3 km²', radius: 977, area: '3.00 km²' },
];

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
          setError(err.message || 'Nie udało się przeprowadzić oceny operatorów.');
          setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [targetCoords[0], targetCoords[1], radiusM]);

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
        source: 'UKE',
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
    if (!data?.operators) return null;
    return (
      data.operators.find(o => o.operator === selectedOpName) ||
      data.operators.find(o => o.isWinner) ||
      data.operators[0] ||
      null
    );
  }, [data, selectedOpName]);

  return (
    <div className={`ae-dialog-dock ${isMinimized ? 'is-minimized' : ''}`}>
      {/* Header */}
      <div className="ae-header">
        <div className="ae-header-info">
          <div className="ae-header-icon">
            <Radar size={18} />
          </div>
          <div className="ae-header-titles">
            <h2 className="ae-title">
              Audyt zasięgu 4 operatorów
              <span className="ae-title-badge">SI2PEM + UKE</span>
            </h2>
            <div className="ae-subtitle">
              <span>{targetCoords[0].toFixed(5)}, {targetCoords[1].toFixed(5)}</span>
              <span>·</span>
              <span>Obszar {areaKm2.toFixed(2)} km² ({Math.round(radiusM)} m)</span>
            </div>
          </div>
        </div>

        <div className="ae-header-actions">
          <button
            type="button"
            className="ae-pick-another-btn"
            onClick={onPickOnMap}
            title="Wskaż inny budynek, działkę lub miejsce na mapie"
          >
            <Crosshair size={12} />
            <span>Zmień punkt</span>
          </button>
          <button
            type="button"
            className="ae-icon-btn"
            title={isMinimized ? 'Rozwiń panel' : 'Zwiń panel'}
            aria-label={isMinimized ? 'Rozwiń panel' : 'Zwiń panel'}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
          </button>
          <button
            type="button"
            className="ae-icon-btn"
            title="Zamknij audyt"
            aria-label="Zamknij audyt"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Target Area Controls Bar */}
          <div className="ae-target-bar">
            {/* Presets Grid */}
            <div className="ae-radius-presets">
              {PRESETS.map(p => {
                const isActive = Math.abs(radiusM - p.radius) < 25;
                return (
                  <button
                    key={p.radius}
                    type="button"
                    className={`ae-preset-btn ${isActive ? 'active' : ''}`}
                    onClick={() => onRadiusChange(p.radius)}
                  >
                    <span className="ae-preset-label">{p.label}</span>
                    <span className="ae-preset-metrics">{p.radius}m · {p.area}</span>
                  </button>
                );
              })}
            </div>

            {/* Slider */}
            <div className="ae-slider-row">
              <span className="ae-slider-label">Promień terenu:</span>
              <input
                type="range"
                className="ae-radius-slider"
                min="80"
                max="977"
                step="10"
                value={Math.round(radiusM)}
                onChange={e => onRadiusChange(Number(e.target.value))}
              />
              <span className="ae-slider-value">
                <strong>{Math.round(radiusM)} m</strong>
                <small>({areaKm2.toFixed(2)} km²)</small>
              </span>
            </div>
          </div>

          {/* Body Content */}
          <div className="ae-body">
            {loading ? (
              <div className="ae-loading-state">
                <div className="ae-radar-sweep">
                  <Radar size={24} />
                </div>
                <h3 className="ae-loading-title">Przeliczanie parametrów 4 operatorów…</h3>
                <p className="ae-loading-desc">
                  Trwa sprawdzanie najbliższych stacji bazowych, wysokości masztów, azymutów sektorów antenowych,
                  agregacji pasm oraz sprawozdań laboratoryjnych SI2PEM.
                </p>
              </div>
            ) : error ? (
              <div className="ae-error-state">
                <AlertTriangle size={28} color="#f87171" />
                <p className="ae-error-text">{error}</p>
                <button
                  type="button"
                  className="ae-btn-secondary"
                  onClick={() => onRadiusChange(radiusM)}
                >
                  Spróbuj ponownie
                </button>
              </div>
            ) : data ? (
              <>
                {/* 4-Operator Leaderboard Table (All 4 visible at once!) */}
                <div className="ae-leaderboard-section">
                  <div className="ae-leaderboard-header">
                    <span>Ranking operatorów w tym punkcie</span>
                    <span className="ae-leaderboard-hint">Kliknij operatora, aby rozwinąć audyt</span>
                  </div>

                  <div className="ae-leaderboard-grid">
                    {data.operators.map(op => {
                      const isSelected = selectedOp?.operator === op.operator;
                      const brandColor = OP_COLORS[op.operator] || '#94a3b8';
                      const s = op.servingStation;

                      return (
                        <div
                          key={op.operator}
                          className={`ae-leaderboard-row ${op.isWinner ? 'is-winner' : ''} ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedOpName(op.operator)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedOpName(op.operator);
                            }
                          }}
                        >
                          {/* Col 1: Rank & Brand */}
                          <div className="ae-row-brand">
                            <span className="ae-rank-number">
                              {op.isWinner ? <Trophy size={13} className="ae-gold-trophy" /> : `#${op.rank}`}
                            </span>
                            <div className="ae-brand-info">
                              <span className="ae-brand-name">
                                <span className="ae-brand-dot" style={{ background: brandColor }} />
                                <span className="ae-brand-label">{op.operator}</span>
                                {s?.isNetworks && (
                                  <span
                                    className="ae-networks-tag"
                                    title={`Współdzielenie stacji w ramach NetWorkS! z ${s.networksPartner || (op.operator === 'Orange' ? 'T-Mobile' : 'Orange')}`}
                                  >
                                    N!
                                  </span>
                                )}
                              </span>
                              <span
                                className="ae-station-sub"
                                title={s ? `${s.stationId || s.id} · ${formatDist(s.distanceKm)}` : undefined}
                              >
                                {s ? `${s.stationId || s.id} · ${formatDist(s.distanceKm)}` : 'Brak stacji w zasięgu'}
                              </span>
                            </div>
                          </div>

                          {/* Col 2: Telemetry Badges */}
                          <div className="ae-row-telemetry">
                            {s ? (
                              <>
                                {s.isNetworks && (
                                  <span
                                    className="ae-metric-chip chip-networks"
                                    title={`NetWorkS! (N!): stacja współdzielona z operatorem ${s.networksPartner || (op.operator === 'Orange' ? 'T-Mobile' : 'Orange')}`}
                                  >
                                    N! NetWorkS!
                                  </span>
                                )}
                                <span
                                  className={`ae-metric-chip ${s.hasCband5G ? 'chip-cband' : 'chip-dim'}`}
                                  title={s.hasCband5G ? '5G C-Band 3600 MHz n78 aktywny' : 'Brak pasma 5G 3600 MHz'}
                                >
                                  {s.hasCband5G ? '5G 3.6 GHz' : 'LTE-A'}
                                </span>
                                <span
                                  className={`ae-metric-chip ${s.isLosClear ? 'chip-ok' : 'chip-warn'}`}
                                  title={s.isLosClear ? 'Widoczność optyczna LOS czysta' : `Przeszkoda ${s.obstructionM.toFixed(1)}m`}
                                >
                                  {s.isLosClear ? 'LOS Czysty' : `LOS -${s.obstructionM.toFixed(1)}m`}
                                </span>
                                <span
                                  className={`ae-metric-chip ${s.isMainLobe ? 'chip-ok' : s.isBacklobe ? 'chip-err' : 'chip-dim'}`}
                                  title={`Sektor ${s.bestSectorAzimuth}° (odchylenie ${s.sectorDeviationDeg.toFixed(0)}°)`}
                                >
                                  {s.bestSectorAzimuth}° ({s.sectorDeviationDeg.toFixed(0)}°)
                                </span>
                              </>
                            ) : (
                              <span className="ae-no-station-label">Brak SI2PEM</span>
                            )}
                          </div>

                          {/* Col 3: Score and Grade */}
                          <div className="ae-row-score">
                            <span className="ae-score-value">
                              <strong>{op.score}</strong>
                              <small>/100</small>
                            </span>
                            <span className={`ae-grade-tag grade-${op.grade[0]}`}>
                              {op.grade}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Operator Detailed Dossier */}
                {selectedOp && (
                  <div className="ae-dossier-card">
                    <div className="ae-dossier-header">
                      <div className="ae-dossier-title">
                        <span
                          className="ae-brand-dot"
                          style={{ background: OP_COLORS[selectedOp.operator] || '#94a3b8' }}
                        />
                        <strong className="ae-dossier-heading">Audyt inżynieryjny: {selectedOp.operator}</strong>
                        {selectedOp.isNetworks && (
                          <span
                            className="ae-networks-pill"
                            title="Infrastruktura współdzielona w ramach sojuszu NetWorkS! (Orange + T-Mobile)"
                          >
                            N! NetWorkS!
                          </span>
                        )}
                        <span className={`ae-grade-tag grade-${selectedOp.grade[0]}`}>
                          Ocena {selectedOp.grade} ({selectedOp.score} / 100 pkt)
                        </span>
                      </div>

                      {selectedOp.servingStation && onOpenTerrainProfile && (
                        <button
                          type="button"
                          className="ae-profile-btn"
                          onClick={() => handleLaunchProfile(selectedOp)}
                          title="Otwórz wykres profilu terenu LiDAR z tej stacji"
                        >
                          <Mountain size={13} />
                          <span>Profil terenu</span>
                        </button>
                      )}
                    </div>

                    {/* Serving station telemetry table */}
                    {selectedOp.servingStation ? (
                      <div className="ae-telemetry-grid">
                        <div className="ae-tel-cell">
                          <span className="ae-tel-k">Najbliższa stacja</span>
                          <span className="ae-tel-v" title={selectedOp.servingStation.address}>
                            {selectedOp.servingStation.stationId || selectedOp.servingStation.id}
                          </span>
                        </div>
                        <div className="ae-tel-cell">
                          <span className="ae-tel-k">Fizyczna odległość</span>
                          <span className="ae-tel-v ae-highlight">
                            {formatDist(selectedOp.servingStation.distanceKm)}
                          </span>
                        </div>
                        <div className="ae-tel-cell">
                          <span className="ae-tel-k">Wysokość anteny</span>
                          <span className="ae-tel-v">
                            {selectedOp.servingStation.antennaHeightM} m n.p.t.
                          </span>
                        </div>
                        <div className="ae-tel-cell">
                          <span className="ae-tel-k">Sektor antenowy</span>
                          <span className="ae-tel-v">
                            {selectedOp.servingStation.bestSectorAzimuth}° (odch. {selectedOp.servingStation.sectorDeviationDeg.toFixed(1)}°)
                          </span>
                        </div>
                        <div className="ae-tel-cell">
                          <span className="ae-tel-k">Widoczność LiDAR</span>
                          <span className={`ae-tel-v ${selectedOp.servingStation.isLosClear ? 'text-ok' : 'text-warn'}`}>
                            {selectedOp.servingStation.isLosClear ? 'Czysty tor (LOS)' : `Przesłonięcie ${selectedOp.servingStation.obstructionM.toFixed(1)}m`}
                          </span>
                        </div>
                        <div className="ae-tel-cell">
                          <span className="ae-tel-k">Pasmo 5G C-Band</span>
                          <span className={`ae-tel-v ${selectedOp.servingStation.hasCband5G ? 'text-cband' : ''}`}>
                            {selectedOp.servingStation.hasCband5G ? '3600 MHz (n78)' : 'Brak (tylko LTE)'}
                          </span>
                        </div>
                        {selectedOp.servingStation.isNetworks && (
                          <div className="ae-tel-cell ae-tel-cell-full">
                            <span className="ae-tel-k">Sojusz radiowy RAN</span>
                            <span className="ae-tel-v text-networks">
                              NetWorkS! (N!) · Współdzielenie z {selectedOp.servingStation.networksPartner || (selectedOp.operator === 'Orange' ? 'T-Mobile' : 'Orange')}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="ae-no-station-box">
                        Brak aktywnych stacji bazowych ze sprawozdaniem SI2PEM w promieniu 7.5 km.
                      </div>
                    )}

                    {/* Score Breakdown Bar */}
                    <div className="ae-breakdown-bar-wrap">
                      <div className="ae-breakdown-bar">
                        <div
                          className="ae-seg ae-seg-terrain"
                          style={{ width: `${(selectedOp.scoreBreakdown.terrainLos / 100) * 100}%` }}
                          title={`Teren i LOS: ${selectedOp.scoreBreakdown.terrainLos}/30`}
                        />
                        <div
                          className="ae-seg ae-seg-spectrum"
                          style={{ width: `${(selectedOp.scoreBreakdown.spectrumBands / 100) * 100}%` }}
                          title={`Pasma i 5G: ${selectedOp.scoreBreakdown.spectrumBands}/30`}
                        />
                        <div
                          className="ae-seg ae-seg-sector"
                          style={{ width: `${(selectedOp.scoreBreakdown.sectorAlignment / 100) * 100}%` }}
                          title={`Kąt sektora: ${selectedOp.scoreBreakdown.sectorAlignment}/20`}
                        />
                        <div
                          className="ae-seg ae-seg-infra"
                          style={{ width: `${(selectedOp.scoreBreakdown.infrastructure / 100) * 100}%` }}
                          title={`Maszt i SI2PEM: ${selectedOp.scoreBreakdown.infrastructure}/20`}
                        />
                      </div>
                      <div className="ae-breakdown-legend">
                        <span className="ae-legend-item">
                          <span className="ae-legend-dot dot-terrain" />
                          <span>Teren/LOS: {selectedOp.scoreBreakdown.terrainLos}/30</span>
                        </span>
                        <span className="ae-legend-item">
                          <span className="ae-legend-dot dot-spectrum" />
                          <span>Pasma: {selectedOp.scoreBreakdown.spectrumBands}/30</span>
                        </span>
                        <span className="ae-legend-item">
                          <span className="ae-legend-dot dot-sector" />
                          <span>Sektor: {selectedOp.scoreBreakdown.sectorAlignment}/20</span>
                        </span>
                        <span className="ae-legend-item">
                          <span className="ae-legend-dot dot-infra" />
                          <span>Infrastruktura: {selectedOp.scoreBreakdown.infrastructure}/20</span>
                        </span>
                      </div>
                    </div>

                    {/* Verdict */}
                    {selectedOp.verdict && (
                      <div className="ae-dossier-verdict">
                        „{selectedOp.verdict}”
                      </div>
                    )}

                    {/* Concrete RF Engineering Pros */}
                    {selectedOp.pros.length > 0 && (
                      <div className="ae-facts-group">
                        <div className="ae-facts-heading text-pro">
                          <CheckCircle2 size={13} />
                          <span>Mocne strony i atuty ({selectedOp.pros.length})</span>
                        </div>
                        <ul className="ae-facts-list">
                          {selectedOp.pros.map((pro, idx) => (
                            <li key={idx} className="ae-fact-item fact-pro">
                              <CheckCircle2 size={13} className="ae-fact-icon" />
                              <span>{pro}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Concrete RF Engineering Cons */}
                    {selectedOp.cons.length > 0 && (
                      <div className="ae-facts-group">
                        <div className="ae-facts-heading text-con">
                          <AlertTriangle size={13} />
                          <span>Ograniczenia i słabe punkty ({selectedOp.cons.length})</span>
                        </div>
                        <ul className="ae-facts-list">
                          {selectedOp.cons.map((con, idx) => (
                            <li key={idx} className="ae-fact-item fact-con">
                              <AlertTriangle size={13} className="ae-fact-icon" />
                              <span>{con}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* SI2PEM ground truth note */}
                    <div className="ae-dossier-footer">
                      <ShieldCheck size={12} color="#10b981" />
                      <span>
                        {selectedOp.si2pemStationsCount} stacji z SI2PEM uwzględnionych
                        {selectedOp.unverifiedStationsCount > 0 && ` · ${selectedOp.unverifiedStationsCount} pozwoleń UKE odrzucono (brak pomiaru SI2PEM)`}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
