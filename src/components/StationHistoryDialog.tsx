import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  Database,
  Radio,
  Activity,
  Layers,
  Sparkles,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Plus,
  Building2,
  Ruler,
  Maximize2
} from 'lucide-react';
import type { Tower, TowerHistoryData, TowerHistoryEvent, UkePermitGroup, UkeMilestone, CollocatedStation, PemTimelineItem } from '../types';
import { operatorColor } from '../lib/constants';
import { useI18n } from '../lib/i18n';

interface Props {
  tower: Tower;
  onClose: () => void;
  onOpenCreateStation?: (tower: Tower) => void;
  onSelectTower?: (towerId: string) => void;
}

export default function StationHistoryDialog({ tower, onClose, onOpenCreateStation, onSelectTower }: Props) {
  const { lang } = useI18n();
  const isPl = lang === 'pl';

  const [activeTab, setActiveTab] = useState<'btmap' | 'uke' | 'pem'>('btmap');
  const [data, setData] = useState<TowerHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        // If not in BTMap, default to UKE tab so user immediately sees what changed in UKE
        if (!history.isBtmap) {
          setActiveTab('uke');
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

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return isPl ? 'Brak daty' : 'No date';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString(isPl ? 'pl-PL' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const isBtmapStation = tower.source === 'BTMAP' || tower.source === 'User';

  return (
    <div className="modal-backdrop station-history-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window station-history-window" onClick={e => e.stopPropagation()}>
        <header className="station-history-header">
          <div className="station-history-title-area">
            <div className="station-history-header-tags">
              <span className={`station-badge-source ${isBtmapStation ? 'btmap' : 'uke'}`}>
                <Database size={13} />
                {isBtmapStation ? (isPl ? 'Baza BTMap' : 'BTMap Database') : (isPl ? 'Rejestr UKE' : 'UKE Registry')}
              </span>
              {tower.operators.map(op => (
                <span
                  key={op.name}
                  className="station-operator-chip"
                  style={{ borderLeftColor: operatorColor(op.name) }}
                >
                  <i style={{ background: operatorColor(op.name) }} />
                  {op.name}
                </span>
              ))}
              <span className="station-history-code">
                {tower.stationId || tower.operators[0]?.stationIds?.[0] || tower.id}
              </span>
            </div>
            <h2>
              <History size={20} className="header-icon" />
              <span>{isPl ? 'Historia stacji i zmian radiowych' : 'Station History & RF Changes'}</span>
            </h2>
            <p className="station-history-address">{tower.address || (isPl ? 'Brak dokładnego adresu' : 'No address')}</p>
          </div>
          <button type="button" className="icon-button close-btn" onClick={onClose} aria-label="Zamknij">
            <X size={20} />
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="station-history-tabs" aria-label="Sekcje historii">
          <button
            type="button"
            className={`station-history-tab ${activeTab === 'btmap' ? 'active' : ''}`}
            onClick={() => setActiveTab('btmap')}
          >
            <Database size={15} />
            <span>{isPl ? 'Baza BTMap' : 'BTMap Community'}</span>
            {data?.btmap && (
              <span className="tab-counter">{data.btmap.totalEvents}</span>
            )}
          </button>
          <button
            type="button"
            className={`station-history-tab ${activeTab === 'uke' ? 'active' : ''}`}
            onClick={() => setActiveTab('uke')}
          >
            <Radio size={15} />
            <span>{isPl ? 'UKE – Co się zmieniło' : 'UKE – What Changed'}</span>
            {data?.uke?.milestones?.length ? (
              <span className="tab-counter milestone-pill">{data.uke.milestones.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`station-history-tab ${activeTab === 'pem' ? 'active' : ''}`}
            onClick={() => setActiveTab('pem')}
          >
            <Layers size={15} />
            <span>{isPl ? 'Współlokacje i PEM' : 'Colocation & PEM'}</span>
            {((data?.uke?.collocated?.length || 0) + (data?.pem?.length || 0)) > 0 && (
              <span className="tab-counter">
                {(data?.uke?.collocated?.length || 0) + (data?.pem?.length || 0)}
              </span>
            )}
          </button>
        </nav>

        {/* Modal Body */}
        <div className="station-history-body">
          {loading && (
            <div className="station-history-loading">
              <div className="spinner" />
              <p>{isPl ? 'Wczytywanie historii stacji i rejestru UKE...' : 'Loading station history and UKE records...'}</p>
            </div>
          )}

          {error && (
            <div className="station-history-error">
              <AlertTriangle size={24} />
              <p>{error}</p>
            </div>
          )}

          {!loading && data && activeTab === 'btmap' && (
            <div className="station-history-tab-content btmap-tab-content">
              {!data.isBtmap && (
                <div className="history-uke-notice">
                  <div className="history-uke-notice-icon">
                    <Database size={20} />
                  </div>
                  <div className="history-uke-notice-text">
                    <strong>{isPl ? 'Ta stacja pochodzi z urzędowego rejestru pozwoleń UKE' : 'This station is from the official UKE registry'}</strong>
                    <p>
                      {isPl
                        ? 'Nie została jeszcze dodana ani zweryfikowana przez społeczność BTMap. Dodaj stację do naszej bazy, aby weryfikować azymuty sektorów, dodawać zdjęcia terenowe i śledzić historię modyfikacji!'
                        : 'It has not been verified or added to BTMap by the community yet. Add it to our database to verify sector azimuths, upload field photos and track revisions!'}
                    </p>
                  </div>
                  {onOpenCreateStation && (
                    <button
                      type="button"
                      className="history-add-btmap-btn"
                      onClick={() => {
                        onClose();
                        onOpenCreateStation(tower);
                      }}
                    >
                      <Plus size={15} />
                      <span>{isPl ? 'Dodaj do bazy BTMap' : 'Add to BTMap'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Station BTMap Meta Card */}
              <div className="history-meta-card">
                <div className="history-meta-item">
                  <span className="meta-label">{isPl ? 'Status w bazie' : 'Database status'}</span>
                  <span className="meta-value highlight">
                    {data.isBtmap ? (isPl ? 'Zweryfikowana w BTMap' : 'Verified in BTMap') : (isPl ? 'Surowy wykaz UKE' : 'Raw UKE permit')}
                  </span>
                </div>
                {data.createdAt && (
                  <div className="history-meta-item">
                    <span className="meta-label">{isPl ? 'Data rejestracji' : 'Registration date'}</span>
                    <span className="meta-value">
                      <Calendar size={13} /> {formatDate(data.createdAt)}
                    </span>
                  </div>
                )}
                {data.addedBy && (
                  <div className="history-meta-item">
                    <span className="meta-label">{isPl ? 'Autor wpisu' : 'Added by'}</span>
                    <span className="meta-value">
                      <UserIcon size={13} /> {data.addedBy}
                    </span>
                  </div>
                )}
                {data.mastType && (
                  <div className="history-meta-item">
                    <span className="meta-label">{isPl ? 'Konstrukcja' : 'Mast structure'}</span>
                    <span className="meta-value">
                      <Building2 size={13} /> {data.mastType}
                    </span>
                  </div>
                )}
                {data.height != null && data.height > 0 && (
                  <div className="history-meta-item">
                    <span className="meta-label">{isPl ? 'Wysokość' : 'Height'}</span>
                    <span className="meta-value">
                      <Ruler size={13} /> {data.height} m n.p.t.
                    </span>
                  </div>
                )}
              </div>

              {/* BTMap Timeline */}
              <div className="history-section-title">
                <History size={16} />
                <span>{isPl ? 'Oś czasu aktywności społeczności BTMap' : 'BTMap Community Activity Timeline'}</span>
              </div>

              {data.btmap.timeline.length === 0 ? (
                <div className="history-empty-state">
                  <p>{isPl ? 'Brak zarejestrowanych wpisów w historii tej stacji.' : 'No recorded activity for this station yet.'}</p>
                </div>
              ) : (
                <div className="history-timeline">
                  {data.btmap.timeline.map((event, idx) => {
                    const isLast = idx === data.btmap.timeline.length - 1;
                    return (
                      <div key={event.id} className={`history-timeline-entry ${event.changeType.toLowerCase()}`}>
                        <div className="history-timeline-gutter">
                          <div className={`history-timeline-dot dot-${event.changeType.toLowerCase()}`}>
                            {event.changeType === 'CREATED' && <CheckCircle2 size={13} />}
                            {event.changeType === 'PHOTO' && <Maximize2 size={13} />}
                            {event.changeType === 'COMMENT' && <Activity size={13} />}
                            {event.changeType !== 'CREATED' && event.changeType !== 'PHOTO' && event.changeType !== 'COMMENT' && (
                              <Sparkles size={13} />
                            )}
                          </div>
                          {!isLast && <div className="history-timeline-line" />}
                        </div>
                        <div className="history-timeline-content">
                          <div className="history-entry-header">
                            <span className="history-entry-title">{event.title}</span>
                            <span className="history-entry-date">{formatDate(event.createdAt)}</span>
                          </div>
                          <div className="history-entry-author">
                            <UserIcon size={12} />
                            <span>{event.userNick}</span>
                          </div>

                          {event.description && (
                            <p className="history-entry-desc">{event.description}</p>
                          )}

                          {event.diff && (
                            <div className="history-entry-diff">
                              {Object.entries(event.diff).map(([key, val]) => (
                                <div key={key} className="history-diff-row">
                                  <span className="diff-key">{key}:</span>
                                  {val.old != null && <span className="diff-old">{String(val.old)}</span>}
                                  <ArrowRight size={12} className="diff-arrow" />
                                  <span className="diff-new">{String(val.new)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {event.photoUrl && (
                            <div className="history-entry-photo">
                              <img
                                src={event.photoUrl}
                                alt="Zdjęcie terenowe stacji"
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
              )}
            </div>
          )}

          {!loading && data && activeTab === 'uke' && (
            <div className="station-history-tab-content uke-tab-content">
              {/* Radio Modernization Summary Cards */}
              <div className="uke-summary-grid">
                <div className={`uke-summary-card ${data.uke.has5GCBand ? 'active' : ''}`}>
                  <span className="uke-sum-badge">5G C-Band 3.6 GHz</span>
                  <strong>{data.uke.has5GCBand ? (isPl ? 'Wdrożone (pasmo n78)' : 'Deployed (n78 band)') : (isPl ? 'Brak pasma 3.6 GHz' : 'No 3.6 GHz band')}</strong>
                  <p>{isPl ? 'Prawdziwe pasmo 5G wysokich prędkości aukcji UKE.' : 'High-capacity UKE auction 5G band.'}</p>
                </div>

                <div className={`uke-summary-card ${data.uke.has5GDSS ? 'active' : ''}`}>
                  <span className="uke-sum-badge">5G DSS (2100/700)</span>
                  <strong>{data.uke.has5GDSS ? (isPl ? 'Aktywne współdzielenie' : 'Active DSS sharing') : (isPl ? 'Brak pasma DSS' : 'No DSS band')}</strong>
                  <p>{isPl ? 'Współdzielenie widma z siecią LTE.' : 'Spectrum sharing with LTE.'}</p>
                </div>

                <div className={`uke-summary-card ${data.uke.lteBandsCount >= 3 ? 'active' : ''}`}>
                  <span className="uke-sum-badge">Agregacja LTE</span>
                  <strong>
                    {data.uke.lteBandsCount > 0
                      ? `${data.uke.lteBandsCount}CA (${data.uke.lteBandsCount} pasma LTE)`
                      : (isPl ? 'Brak LTE' : 'No LTE')}
                  </strong>
                  <p>{isPl ? 'Agregacja pasm Carrier Aggregation dla szybszego internetu 4G.' : 'Carrier Aggregation bands for high 4G throughput.'}</p>
                </div>

                {data.uke.lastRevisionYear && (
                  <div className="uke-summary-card highlight">
                    <span className="uke-sum-badge">{isPl ? 'Ostatnia zmiana UKE' : 'Latest UKE revision'}</span>
                    <strong>{data.uke.lastRevisionYear} r.</strong>
                    <p>{isPl ? 'Rok wydania najnowszej decyzji lub zmiany pozwolenia.' : 'Year of the latest UKE authorization or modification.'}</p>
                  </div>
                )}
              </div>

              {/* Milestones / Detected Changes */}
              {data.uke.milestones.length > 0 && (
                <div className="uke-milestones-section">
                  <div className="history-section-title">
                    <Sparkles size={16} />
                    <span>{isPl ? 'Wykryte modernizacje i kamienie milowe w UKE' : 'Detected UKE Modernizations & Milestones'}</span>
                  </div>
                  <div className="uke-milestones-list">
                    {data.uke.milestones.map((m, idx) => (
                      <div key={idx} className={`uke-milestone-item milestone-${m.badgeType}`}>
                        <div className="milestone-badge-pill">{m.badge}</div>
                        <div className="milestone-text">
                          <strong>{m.title}</strong>
                          <p>{m.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Permits Timeline */}
              <div className="history-section-title">
                <Radio size={16} />
                <span>{isPl ? 'Zezwolenia radiowe i decyzje rezerwacyjne UKE' : 'UKE Radio Authorizations & Permits'}</span>
              </div>

              {data.uke.permits.length === 0 ? (
                <div className="history-empty-state">
                  <p>{isPl ? 'Brak szczegółowych informacji o pozwoleniach radiowych dla tej stacji.' : 'No detailed permit records found for this station.'}</p>
                </div>
              ) : (
                <div className="uke-permits-list">
                  {data.uke.permits.map(permit => (
                    <div key={permit.permitId} className="uke-permit-card">
                      <div className="permit-card-top">
                        <div className="permit-card-left">
                          <span className="permit-op-dot" style={{ background: operatorColor(permit.operator) }} />
                          <strong className="permit-number">{permit.permitId}</strong>
                          <span className={`permit-kind-badge ${permit.kind.includes('zmP') ? 'modified' : 'new'}`}>
                            {permit.kind}
                          </span>
                        </div>
                        {permit.decisionYear && (
                          <span className="permit-year-tag">
                            <Calendar size={12} /> {isPl ? `Rok: ${permit.decisionYear}` : `Year: ${permit.decisionYear}`}
                          </span>
                        )}
                      </div>

                      <div className="permit-bands-strip">
                        <span className="bands-strip-label">{isPl ? 'Autoryzowane pasma:' : 'Authorized bands:'}</span>
                        <div className="bands-pill-list">
                          {permit.bands.map((b, i) => (
                            <span key={`${b.tech}-${b.band}-${i}`} className={`band-chip tech-${b.tech.toLowerCase()}`}>
                              {b.tech} {b.band}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="permit-card-bottom">
                        {permit.expires && (
                          <span className="permit-expires">
                            {isPl ? 'Ważność do:' : 'Expires:'} <strong>{permit.expires}</strong>
                          </span>
                        )}
                        {permit.revision != null && (
                          <span className="permit-revision">
                            {isPl ? `Rewizja zmiany: nr ${permit.revision}` : `Revision: #${permit.revision}`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && data && activeTab === 'pem' && (
            <div className="station-history-tab-content pem-tab-content">
              {/* Co-located Operators */}
              <div className="history-section-title">
                <Layers size={16} />
                <span>{isPl ? 'Współlokacja – Inne stacje w promieniu 40 metrów' : 'Co-located Stations within 40 meters'}</span>
              </div>

              {data.uke.collocated.length === 0 ? (
                <div className="history-empty-state">
                  <p>{isPl ? 'Brak wykrytych stacji innych operatorów w bezpośrednim sąsiedztwie.' : 'No other operator stations detected nearby.'}</p>
                </div>
              ) : (
                <div className="collocated-list">
                  {data.uke.collocated.map(c => (
                    <div key={`${c.towerId}-${c.operator}`} className="collocated-card">
                      <div className="collocated-left">
                        <span className="operator-dot" style={{ background: operatorColor(c.operator) }} />
                        <span className="collocated-op-name">{c.operator}</span>
                        {c.stationId && <span className="collocated-id">ID: {c.stationId}</span>}
                      </div>
                      <div className="collocated-right">
                        <span className="collocated-dist">~{c.distanceMeters} m</span>
                        {onSelectTower && (
                          <button
                            type="button"
                            className="collocated-nav-btn"
                            onClick={() => {
                              onClose();
                              onSelectTower(c.towerId);
                            }}
                            title={isPl ? 'Przejdź do tej stacji' : 'Go to this station'}
                          >
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* PEM Measurements History */}
              <div className="history-section-title pem-title-gap">
                <Activity size={16} />
                <span>{isPl ? 'Historia urzędowych pomiarów środowiskowych PEM (SI2PEM)' : 'SI2PEM Environmental EMF Measurements'}</span>
              </div>

              {data.pem.length === 0 ? (
                <div className="history-empty-state">
                  <p>{isPl ? 'Brak zarejestrowanych sprawozdań pomiarowych PEM w lokalnej pamięci podręcznej SI2PEM.' : 'No PEM measurement reports in local cache.'}</p>
                </div>
              ) : (
                <div className="pem-history-list">
                  {data.pem.map((p, idx) => (
                    <div key={p.id || idx} className="pem-history-card">
                      <div className="pem-card-top">
                        <span className="pem-date">
                          <Calendar size={13} /> {p.date || (isPl ? 'Brak daty' : 'No date')}
                        </span>
                        {p.number && <strong className="pem-number">Nr: {p.number}</strong>}
                      </div>
                      {p.laboratory && <p className="pem-lab">{p.laboratory}</p>}
                      {p.downloadUrl && (
                        <a
                          href={p.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pem-pdf-link"
                        >
                          <ExternalLink size={13} />
                          <span>{isPl ? 'Otwórz sprawozdanie PDF' : 'Open PDF report'}</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lightbox for Field Photos */}
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
    </div>
  );
}
