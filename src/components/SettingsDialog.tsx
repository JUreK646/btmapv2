import React, { useState } from 'react';
import {
  MapPin,
  Radio,
  RadioTower,
  Compass,
  SlidersHorizontal,
  Layers,
  Sun,
  Moon,
  RotateCcw,
  Trash2,
  Check,
  Sparkles,
} from 'lucide-react';
import Modal from './Modal';
import { useI18n, type Lang } from '../lib/i18n';
import type { AppSettings, MarkerShape, MarkerSize, StationLabelsMode, CoordFormat, AzimuthOpacity, AzimuthLength } from '../lib/settings';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { Theme } from '../types';

interface Props {
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (next: AppSettings) => void;
  onReset: () => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  onNotice?: (msg: string) => void;
}

type SettingsTab = 'markers' | 'azimuths' | 'navigation' | 'system';

export default function SettingsDialog({
  onClose,
  settings,
  onUpdate,
  onReset,
  theme,
  onThemeChange,
  lang,
  onLangChange,
  onNotice,
}: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('markers');

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdate({ ...settings, [key]: value });
  };

  const handleClearCache = () => {
    try {
      const keysToRemove = ['btmap.filters', 'btmap.basemap', 'btmap.pemCache'];
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
      if (onNotice) onNotice(t.settingsClearCacheSuccess);
    } catch {
      // ignore
    }
  };

  const handleResetDefaults = () => {
    onReset();
    if (onNotice) onNotice(t.settingsResetDefaultsSuccess);
  };

  return (
    <Modal wide title={t.settingsTitle} onClose={onClose}>
      <div className="settings-modal-wrap">
        <p className="settings-modal-intro">{t.settingsDesc}</p>

        {/* Tab Navigation */}
        <div className="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'markers'}
            className={`settings-tab-btn ${activeTab === 'markers' ? 'active' : ''}`}
            onClick={() => setActiveTab('markers')}
          >
            <MapPin size={16} />
            <span>{t.settingsTabMarkers}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'azimuths'}
            className={`settings-tab-btn ${activeTab === 'azimuths' ? 'active' : ''}`}
            onClick={() => setActiveTab('azimuths')}
          >
            <Compass size={16} />
            <span>{t.settingsTabAzimuths}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'navigation'}
            className={`settings-tab-btn ${activeTab === 'navigation' ? 'active' : ''}`}
            onClick={() => setActiveTab('navigation')}
          >
            <SlidersHorizontal size={16} />
            <span>{t.settingsTabNavigation}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'system'}
            className={`settings-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            <Layers size={16} />
            <span>{t.settingsTabSystem}</span>
          </button>
        </div>

        {/* Tab Panels */}
        <div className="settings-tab-content">
          {/* TAB 1: MARKERS & MAP */}
          {activeTab === 'markers' && (
            <div className="settings-section-stack">
              {/* Marker Shape Selector */}
              <div className="settings-group">
                <div className="settings-group-header">
                  <label className="settings-label">{t.settingsMarkerShape}</label>
                  <small className="settings-hint">{t.settingsMarkerShapeDesc}</small>
                </div>

                <div className="settings-shape-grid">
                  {/* Option 1: Dots */}
                  <button
                    type="button"
                    className={`settings-shape-card ${settings.markerShape === 'dots' ? 'is-selected' : ''}`}
                    onClick={() => updateSetting('markerShape', 'dots')}
                  >
                    <div className="shape-preview preview-dots">
                      <div className="preview-dot dot-orange" />
                      <div className="preview-dot dot-play" />
                      <div className="preview-dot dot-plus" />
                      <div className="preview-dot dot-tmobile" />
                    </div>
                    <div className="shape-meta">
                      <strong>{t.settingsShapeDots}</strong>
                      <small>{t.settingsShapeDotsDesc}</small>
                    </div>
                    {settings.markerShape === 'dots' && <span className="shape-check"><Check size={14} /></span>}
                  </button>

                  {/* Option 2: Pins (User specific request!) */}
                  <button
                    type="button"
                    className={`settings-shape-card ${settings.markerShape === 'pins' ? 'is-selected' : ''}`}
                    onClick={() => updateSetting('markerShape', 'pins')}
                  >
                    <div className="shape-preview preview-pins">
                      <div className="preview-pin pin-orange">
                        <RadioTower size={11} />
                      </div>
                      <div className="preview-pin pin-play">
                        <RadioTower size={11} />
                      </div>
                      <div className="preview-pin pin-tmobile">
                        <RadioTower size={11} />
                      </div>
                    </div>
                    <div className="shape-meta">
                      <strong>{t.settingsShapePins}</strong>
                      <small>{t.settingsShapePinsDesc}</small>
                    </div>
                    {settings.markerShape === 'pins' && <span className="shape-check"><Check size={14} /></span>}
                  </button>

                  {/* Option 3: Badges */}
                  <button
                    type="button"
                    className={`settings-shape-card ${settings.markerShape === 'badges' ? 'is-selected' : ''}`}
                    onClick={() => updateSetting('markerShape', 'badges')}
                  >
                    <div className="shape-preview preview-badges">
                      <span className="preview-badge"><i className="preview-dot dot-orange" /> Orange</span>
                      <span className="preview-badge"><i className="preview-dot dot-play" /> Play</span>
                    </div>
                    <div className="shape-meta">
                      <strong>{t.settingsShapeBadges}</strong>
                      <small>{t.settingsShapeBadgesDesc}</small>
                    </div>
                    {settings.markerShape === 'badges' && <span className="shape-check"><Check size={14} /></span>}
                  </button>
                </div>
              </div>

              {/* Marker Size */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsMarkerSize}</span>
                </div>
                <div className="settings-pill-group">
                  {(['compact', 'normal', 'large'] as MarkerSize[]).map(sz => (
                    <button
                      key={sz}
                      type="button"
                      className={`settings-pill ${settings.markerSize === sz ? 'is-active' : ''}`}
                      onClick={() => updateSetting('markerSize', sz)}
                    >
                      {sz === 'compact' ? t.settingsSizeCompact : sz === 'normal' ? t.settingsSizeNormal : t.settingsSizeLarge}
                    </button>
                  ))}
                </div>
              </div>

              {/* Station Labels on Map */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsLabels}</span>
                </div>
                <div className="settings-pill-group">
                  {(['none', 'id', 'full'] as StationLabelsMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      className={`settings-pill ${settings.showStationLabels === mode ? 'is-active' : ''}`}
                      onClick={() => updateSetting('showStationLabels', mode)}
                    >
                      {mode === 'none' ? t.settingsLabelsNone : mode === 'id' ? t.settingsLabelsId : t.settingsLabelsFull}
                    </button>
                  ))}
                </div>
              </div>

              {/* High Contrast Markers Toggle */}
              <div className="settings-toggle-row">
                <div className="settings-toggle-text">
                  <span className="settings-row-title">{t.settingsHighContrast}</span>
                  <small className="settings-hint">{t.settingsHighContrastDesc}</small>
                </div>
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.highContrastMarkers}
                    onChange={e => updateSetting('highContrastMarkers', e.target.checked)}
                  />
                  <span className="settings-slider" />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: AZIMUTHS & COVERAGE */}
          {activeTab === 'azimuths' && (
            <div className="settings-section-stack">
              {/* Azimuth Opacity */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsAzimuthOpacity}</span>
                </div>
                <div className="settings-pill-group">
                  {([0.2, 0.45, 0.75] as AzimuthOpacity[]).map(op => (
                    <button
                      key={op}
                      type="button"
                      className={`settings-pill ${settings.azimuthOpacity === op ? 'is-active' : ''}`}
                      onClick={() => updateSetting('azimuthOpacity', op)}
                    >
                      {op === 0.2 ? t.settingsAzOpacitySubtle : op === 0.45 ? t.settingsAzOpacityNormal : t.settingsAzOpacityVibrant}
                    </button>
                  ))}
                </div>
              </div>

              {/* Azimuth Length */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsAzimuthLength}</span>
                </div>
                <div className="settings-pill-group">
                  {(['short', 'normal', 'long'] as AzimuthLength[]).map(len => (
                    <button
                      key={len}
                      type="button"
                      className={`settings-pill ${settings.azimuthLength === len ? 'is-active' : ''}`}
                      onClick={() => updateSetting('azimuthLength', len)}
                    >
                      {len === 'short' ? t.settingsAzLengthShort : len === 'normal' ? t.settingsAzLengthNormal : t.settingsAzLengthLong}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Show Azimuths on Select */}
              <div className="settings-toggle-row">
                <div className="settings-toggle-text">
                  <span className="settings-row-title">{t.settingsAutoAzimuthSelect}</span>
                  <small className="settings-hint">{t.settingsAutoAzimuthSelectDesc}</small>
                </div>
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.autoShowAzimuthsOnSelect}
                    onChange={e => updateSetting('autoShowAzimuthsOnSelect', e.target.checked)}
                  />
                  <span className="settings-slider" />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: NAVIGATION & UNITS */}
          {activeTab === 'navigation' && (
            <div className="settings-section-stack">
              {/* Coordinate Format */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsCoordFormat}</span>
                </div>
                <div className="settings-pill-group">
                  {(['DD', 'DMS'] as CoordFormat[]).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      className={`settings-pill ${settings.coordFormat === fmt ? 'is-active' : ''}`}
                      onClick={() => updateSetting('coordFormat', fmt)}
                    >
                      {fmt === 'DD' ? t.settingsCoordDd : t.settingsCoordDms}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smooth Camera Animations */}
              <div className="settings-toggle-row">
                <div className="settings-toggle-text">
                  <span className="settings-row-title">{t.settingsSmoothFlyTo}</span>
                  <small className="settings-hint">{t.settingsSmoothFlyToDesc}</small>
                </div>
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.smoothFlyTo}
                    onChange={e => updateSetting('smoothFlyTo', e.target.checked)}
                  />
                  <span className="settings-slider" />
                </label>
              </div>

              {/* Remember Map Location */}
              <div className="settings-toggle-row">
                <div className="settings-toggle-text">
                  <span className="settings-row-title">{t.settingsRememberLocation}</span>
                  <small className="settings-hint">{t.settingsRememberLocationDesc}</small>
                </div>
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.rememberMapLocation}
                    onChange={e => updateSetting('rememberMapLocation', e.target.checked)}
                  />
                  <span className="settings-slider" />
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: INTERFACE & STORAGE */}
          {activeTab === 'system' && (
            <div className="settings-section-stack">
              {/* Visual Theme */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsTheme}</span>
                </div>
                <div className="settings-pill-group">
                  <button
                    type="button"
                    className={`settings-pill ${theme === 'dark' ? 'is-active' : ''}`}
                    onClick={() => onThemeChange('dark')}
                  >
                    <Moon size={14} />
                    <span>{t.settingsThemeDark}</span>
                  </button>
                  <button
                    type="button"
                    className={`settings-pill ${theme === 'light' ? 'is-active' : ''}`}
                    onClick={() => onThemeChange('light')}
                  >
                    <Sun size={14} />
                    <span>{t.settingsThemeLight}</span>
                  </button>
                </div>
              </div>

              {/* Language */}
              <div className="settings-row">
                <div className="settings-row-text">
                  <span className="settings-row-title">{t.settingsLanguage}</span>
                </div>
                <div className="settings-pill-group">
                  <button
                    type="button"
                    className={`settings-pill ${lang === 'pl' ? 'is-active' : ''}`}
                    onClick={() => onLangChange('pl')}
                  >
                    Polski (PL)
                  </button>
                  <button
                    type="button"
                    className={`settings-pill ${lang === 'en' ? 'is-active' : ''}`}
                    onClick={() => onLangChange('en')}
                  >
                    English (ENG)
                  </button>
                </div>
              </div>

              {/* Cache Management */}
              <div className="settings-storage-card">
                <div className="settings-storage-info">
                  <strong className="settings-row-title">{t.settingsStorageTitle}</strong>
                  <small className="settings-hint">{t.settingsStorageDesc}</small>
                </div>
                <button
                  type="button"
                  className="secondary-button btn-danger-soft"
                  onClick={handleClearCache}
                >
                  <Trash2 size={14} />
                  <span>{t.settingsClearCache}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="settings-modal-footer">
          <button
            type="button"
            className="settings-reset-btn"
            onClick={handleResetDefaults}
          >
            <RotateCcw size={14} />
            <span>{t.settingsResetDefaults}</span>
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
          >
            {t.settingsClose}
          </button>
        </div>
      </div>
    </Modal>
  );
}
