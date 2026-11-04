import { useState } from 'react';
import {
  Navigation,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  Download,
  Car,
  Compass,
  Smartphone,
  Share2,
} from 'lucide-react';
import type { Tower } from '../types';
import Modal from './Modal';
import { useI18n } from '../lib/i18n';
import {
  formatDd,
  formatDms,
  formatDmm,
  getNavigationProviders,
  downloadStationGpx,
} from '../lib/geoCoords';
import { operatorColor } from '../lib/constants';

interface NavigationDialogProps {
  tower: Tower;
  onClose: () => void;
  onNotice?: (msg: string) => void;
}

export default function NavigationDialog({
  tower,
  onClose,
  onNotice,
}: NavigationDialogProps) {
  const { t, lang } = useI18n();
  const isPl = lang === 'pl';
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const dd = formatDd(tower.lat, tower.lng);
  const dms = formatDms(tower.lat, tower.lng);
  const dmm = formatDmm(tower.lat, tower.lng);

  const copyToClipboard = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotice?.(`${label} ${isPl ? 'skopiowane do schowka!' : 'copied to clipboard!'}`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      onNotice?.(isPl ? 'Nie udało się skopiować do schowka.' : 'Failed to copy to clipboard.');
    }
  };

  const handleDownloadGpx = () => {
    try {
      downloadStationGpx(tower);
      onNotice?.(t.detailsGpxDownloaded);
    } catch {
      onNotice?.(isPl ? 'Błąd podczas generowania pliku GPX.' : 'Error generating GPX file.');
    }
  };

  const providers = getNavigationProviders(
    tower.lat,
    tower.lng,
    tower.stationId || tower.address
  );

  return (
    <Modal title={t.detailsNavigateTitle} onClose={onClose} wide>
      <div className="nav-dialog-content">
        {/* Station Info Banner */}
        <div className="nav-dialog-station-card">
          <div className="nav-dialog-station-header">
            <span className="nav-dialog-operators">
              {tower.operators.map(op => (
                <span key={op.name} className="nav-op-pill">
                  <i style={{ background: operatorColor(op.name) }} />
                  {op.name}
                </span>
              ))}
            </span>
            <span className="nav-dialog-station-id">
              {tower.stationId || tower.operators[0]?.stationIds?.[0] || tower.id}
            </span>
          </div>
          <div className="nav-dialog-address">
            <MapPin size={14} aria-hidden="true" />
            <span>{tower.address || (isPl ? 'Stacja bazowa' : 'Cellular Station')}</span>
            {tower.province && <small>· {tower.province}</small>}
          </div>
        </div>

        {/* Section 1: Navigation Apps */}
        <section className="nav-dialog-section">
          <div className="nav-section-title">
            <Car size={16} aria-hidden="true" />
            <h3>{t.detailsNavApps}</h3>
          </div>
          <p className="nav-section-desc">
            {isPl
              ? 'Wybierz aplikację, aby uruchomić nawigację bezpośrednio pod współrzędne stacji:'
              : 'Choose an app to start turn-by-turn navigation directly to the tower:'}
          </p>

          <div className="nav-apps-grid">
            {providers.map(p => (
              <a
                key={p.id}
                href={p.url}
                target={p.isNativeGeo ? '_self' : '_blank'}
                rel={p.isNativeGeo ? undefined : 'noopener noreferrer'}
                className="nav-app-card"
                title={`${isPl ? 'Nawiguj za pomocą' : 'Navigate using'} ${p.name}`}
              >
                <div className="nav-app-info">
                  <div className="nav-app-name-row">
                    <span className="nav-app-badge">{p.badge}</span>
                    <strong>{p.name}</strong>
                  </div>
                  <span className="nav-app-desc">
                    {isPl ? p.descriptionPl : p.descriptionEn}
                  </span>
                </div>
                <span className="nav-app-action-icon">
                  {p.isNativeGeo ? <Smartphone size={16} /> : <ExternalLink size={16} />}
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* Section 2: GPS Coordinate Formats */}
        <section className="nav-dialog-section">
          <div className="nav-section-title">
            <Compass size={16} aria-hidden="true" />
            <h3>{t.detailsCoordFormats}</h3>
          </div>
          <p className="nav-section-desc">
            {isPl
              ? 'Kliknij, aby skopiować współrzędne w wybranym formacie geograficznym:'
              : 'Click to copy coordinates in your preferred geographic format:'}
          </p>

          <div className="nav-coords-list">
            {/* DD */}
            <div className="nav-coord-item">
              <div className="nav-coord-text">
                <span className="nav-coord-label">{t.detailsFormatDd}</span>
                <code className="nav-coord-value">{dd}</code>
              </div>
              <button
                type="button"
                className="nav-copy-btn"
                onClick={() => void copyToClipboard(dd, 'dd', t.detailsFormatDd)}
                aria-label={`${t.detailsCopyGps} (DD)`}
              >
                {copiedKey === 'dd' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey === 'dd' ? (isPl ? 'Skopiowano' : 'Copied') : (isPl ? 'Kopiuj' : 'Copy')}</span>
              </button>
            </div>

            {/* DMS */}
            <div className="nav-coord-item">
              <div className="nav-coord-text">
                <span className="nav-coord-label">{t.detailsFormatDms}</span>
                <code className="nav-coord-value">{dms}</code>
              </div>
              <button
                type="button"
                className="nav-copy-btn"
                onClick={() => void copyToClipboard(dms, 'dms', t.detailsFormatDms)}
                aria-label={`${t.detailsCopyGps} (DMS)`}
              >
                {copiedKey === 'dms' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey === 'dms' ? (isPl ? 'Skopiowano' : 'Copied') : (isPl ? 'Kopiuj' : 'Copy')}</span>
              </button>
            </div>

            {/* DMM */}
            <div className="nav-coord-item">
              <div className="nav-coord-text">
                <span className="nav-coord-label">{t.detailsFormatDmm}</span>
                <code className="nav-coord-value">{dmm}</code>
              </div>
              <button
                type="button"
                className="nav-copy-btn"
                onClick={() => void copyToClipboard(dmm, 'dmm', t.detailsFormatDmm)}
                aria-label={`${t.detailsCopyGps} (DMM)`}
              >
                {copiedKey === 'dmm' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey === 'dmm' ? (isPl ? 'Skopiowano' : 'Copied') : (isPl ? 'Kopiuj' : 'Copy')}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 3: Waypoint GPX Export */}
        <section className="nav-dialog-section">
          <div className="nav-section-title">
            <Download size={16} aria-hidden="true" />
            <h3>{isPl ? 'Eksport punktu nawigacyjnego' : 'Navigation Waypoint Export'}</h3>
          </div>
          <div className="nav-gpx-card">
            <div className="nav-gpx-info">
              <strong>{t.detailsDownloadGpx}</strong>
              <p>{t.detailsDownloadGpxDesc}</p>
            </div>
            <button
              type="button"
              className="nav-gpx-download-btn"
              onClick={handleDownloadGpx}
            >
              <Download size={15} />
              <span>{isPl ? 'Pobierz .GPX' : 'Download .GPX'}</span>
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
