import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  MapPin,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import type { Tower, TowerHistoryData, StationTimelineEvent } from '../types';
import { useI18n } from '../lib/i18n';

interface Props {
  tower: Tower;
  onClose: () => void;
  onOpenCreateStation?: (tower: Tower) => void;
  onSelectTower?: (towerId: string) => void;
}

function OperatorBrandLogo({ operator }: { operator: string }) {
  const op = operator.toLowerCase();
  if (op.includes('play') || op.includes('p4')) {
    return (
      <span className="sh-op-logo is-play">
        <img src="/logos/play.svg" alt="Play" />
      </span>
    );
  }
  if (op.includes('orange')) {
    return (
      <span className="sh-op-logo is-square">
        <img src="/logos/orange.svg" alt="Orange" />
      </span>
    );
  }
  if (op.includes('t-mobile') || op.includes('tmobile')) {
    return (
      <span className="sh-op-logo is-square">
        <img src="/logos/tmobile.svg" alt="T-Mobile" />
      </span>
    );
  }
  if (op.includes('plus') || op.includes('polkomtel') || op.includes('aero')) {
    return (
      <span className="sh-op-logo is-plus">
        <img src="/logos/plus.svg" alt="Plus" />
      </span>
    );
  }
  return <span className="sh-op-dot" />;
}

function SignalBarsIcon({ variant }: { variant: 'blue' | 'green' }) {
  return (
    <svg
      className={`sh-signal-bars is-${variant}`}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="10" width="2.5" height="4" rx="0.8" fill="currentColor" />
      <rect x="6.5" y="6.5" width="2.5" height="7.5" rx="0.8" fill="currentColor" />
      <rect x="11" y="2.5" width="2.5" height="11.5" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function formatCellsCount(count: number, isPl: boolean): string {
  if (!isPl) return `${count} ${count === 1 ? 'cell' : 'cells'}`;
  if (count === 1) return '1 komórka';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} komórki`;
  }
  return `${count} komórek`;
}

function formatDateGroupHeader(dateStr: string, isPl: boolean): string {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat(isPl ? 'pl-PL' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function StationHistoryDialog({ tower, onClose }: Props) {
  const { lang } = useI18n();
  const isPl = lang === 'pl';

  const [data, setData] = useState<TowerHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/towers/${encodeURIComponent(tower.id)}/history`)
      .then(res => {
        if (!res.ok) throw new Error(isPl ? 'Nie udało się pobrać historii stacji.' : 'Failed to fetch station history.');
        return res.json();
      })
      .then((history: TowerHistoryData) => {
        if (!active) return;
        setData(history);
        const firstCellEvent = history.events?.find(
          e => e.kind === 'cells_updated' || e.kind === 'cells_added'
        );
        if (firstCellEvent) {
          setExpandedIds({ [firstCellEvent.id]: true });
        }
      })
      .catch(err => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tower.id, isPl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activePhoto) {
          setActivePhoto(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePhoto, onClose]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const primaryOp = tower.operators[0]?.name || 'Play';
  const stationCode = tower.stationId || tower.operators[0]?.stationIds?.[0] || tower.id;

  // Group events by dateGroup
  const groupedEvents: Array<{ dateGroup: string; items: StationTimelineEvent[] }> = [];
  if (data?.events) {
    for (const ev of data.events) {
      const last = groupedEvents[groupedEvents.length - 1];
      if (last && last.dateGroup === ev.dateGroup) {
        last.items.push(ev);
      } else {
        groupedEvents.push({ dateGroup: ev.dateGroup, items: [ev] });
      }
    }
  }

  return createPortal(
    <div className="modal-backdrop station-history-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window station-history-window" onClick={e => e.stopPropagation()}>
        <header className="sh-header">
          <div className="sh-header-left">
            <h2 className="sh-title">
              {isPl ? 'Historia zmian stacji' : 'Station change history'}
            </h2>
            <div className="sh-subtitle">
              <OperatorBrandLogo operator={primaryOp} />
              <span className="sh-op-name">{primaryOp}</span>
              <span className="sh-station-code">{stationCode}</span>
            </div>
          </div>
          <button
            type="button"
            className="sh-close-btn"
            onClick={onClose}
            aria-label={isPl ? 'Zamknij' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        <div className="sh-body">
          {loading && (
            <div className="sh-state-box">
              <div className="spinner" />
              <p>{isPl ? 'Wczytywanie historii zmian...' : 'Loading change history...'}</p>
            </div>
          )}

          {error && (
            <div className="sh-state-box is-error">
              <AlertTriangle size={20} />
              <p>{error}</p>
            </div>
          )}

          {!loading && data && (
            <div className="sh-timeline">
              {groupedEvents.map(group => (
                <section key={group.dateGroup} className="sh-date-group">
                  <h3 className="sh-date-heading">
                    {formatDateGroupHeader(group.dateGroup, isPl)}
                  </h3>

                  <div className="sh-date-events">
                    {group.items.map(event => {
                      const isCellEvent = event.kind === 'cells_updated' || event.kind === 'cells_added';
                      const isExpanded = Boolean(expandedIds[event.id]);

                      if (isCellEvent) {
                        return (
                          <div key={event.id} className="sh-event-row is-cells">
                            <div className="sh-event-icon">
                              <SignalBarsIcon variant={event.kind === 'cells_added' ? 'green' : 'blue'} />
                            </div>

                            <div className="sh-event-content">
                              <button
                                type="button"
                                className="sh-cell-trigger"
                                onClick={() => toggleExpand(event.id)}
                                aria-expanded={isExpanded}
                              >
                                <div className="sh-event-top">
                                  <span className="sh-event-title">{event.title}</span>
                                  <span className="sh-event-time">{event.time}</span>
                                </div>

                                <div className="sh-cell-summary">
                                  <div className="sh-cell-summary-left">
                                    <strong className="sh-cells-total">
                                      {formatCellsCount(event.totalCells || 0, isPl)}
                                    </strong>
                                    {event.techCounts?.map(tc => (
                                      <span key={tc.tech} className="sh-tech-pill">
                                        {tc.tech} {tc.count}
                                      </span>
                                    ))}
                                  </div>
                                  <span className="sh-chevron">
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </span>
                                </div>
                              </button>

                              {isExpanded && event.cellGroups && event.cellGroups.length > 0 && (
                                <div className="sh-cells-card">
                                  {event.cellGroups.map(cg => (
                                    <div key={cg.tech} className="sh-cells-group">
                                      <div className="sh-cells-group-header">
                                        <span>{cg.tech}</span>
                                        <span>{formatCellsCount(cg.count, isPl)}</span>
                                      </div>
                                      <div className="sh-cells-rows">
                                        {cg.cells.map((cell, cIdx) => (
                                          <div key={`${cell.label}-${cIdx}`} className="sh-cell-row">
                                            <span className="sh-cell-name">{cell.label}</span>
                                            <span className="sh-cell-param">
                                              {cell.paramLabel}: <strong>{cell.paramValue}</strong>
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={event.id} className="sh-event-row is-location">
                          <div className="sh-event-icon">
                            <MapPin size={15} />
                          </div>

                          <div className="sh-event-content">
                            <div className="sh-event-top">
                              <span className="sh-event-title">{event.title}</span>
                              <span className="sh-event-time">{event.time}</span>
                            </div>

                            {event.diffs && event.diffs.length > 0 && (
                              <div className="sh-diffs-list">
                                {event.diffs.map((d, dIdx) => (
                                  <div key={dIdx} className="sh-diff-line">
                                    <span className="sh-diff-label">{d.label}</span>
                                    {d.oldValue && (
                                      <>
                                        <span className="sh-diff-pill is-old">{d.oldValue}</span>
                                        <ChevronRight size={13} className="sh-diff-arrow" />
                                      </>
                                    )}
                                    <span className="sh-diff-pill is-new">{d.newValue}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {event.description && !event.diffs?.length && (
                              <p className="sh-event-desc">{event.description}</p>
                            )}

                            {event.photoUrl && (
                              <div className="sh-event-photo">
                                <img
                                  src={event.photoUrl}
                                  alt="Zdjęcie stacji"
                                  loading="lazy"
                                  onClick={() => setActivePhoto(event.photoUrl || null)}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <footer className="sh-timeline-footer">
                {isPl ? 'Początek zarejestrowanej historii' : 'Beginning of recorded history'}
              </footer>
            </div>
          )}
        </div>

        {activePhoto && (
          <div className="station-lightbox" onClick={() => setActivePhoto(null)}>
            <div className="station-lightbox-inner" onClick={e => e.stopPropagation()}>
              <img src={activePhoto} alt="Powiększone zdjęcie stacji" />
              <button
                type="button"
                className="station-lightbox-close"
                onClick={() => setActivePhoto(null)}
                aria-label="Zamknij podgląd zdjęcia"
              >
                <X size={22} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
