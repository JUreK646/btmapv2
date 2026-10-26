import React, { useState } from 'react';
import {
  MapPin,
  Compass,
  Navigation,
  MonitorCog,
  Sun,
  Moon,
  RotateCcw,
  Trash2,
  Check,
  Languages,
  Maximize2,
  Tag,
  Contrast,
  Droplet,
  Ruler,
  MousePointerClick,
  Crosshair,
  Wind,
  Bookmark,
  HardDrive,
  type LucideIcon,
} from 'lucide-react';
import Modal from './Modal';
import { useI18n, type Lang } from '../lib/i18n';
import type {
  AppSettings,
  MarkerShape,
  MarkerSize,
  StationLabelsMode,
  CoordFormat,
  AzimuthOpacity,
  AzimuthLength,
} from '../lib/settings';
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

/** Splits "Label (detail)" into main label and secondary detail for compact segmented controls. */
function splitLabel(text: string): { main: string; sub?: string } {
  const match = text.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (match) return { main: match[1], sub: match[2] };
  const dash = text.split(' — ');
  if (dash.length === 2) return { main: dash[0], sub: dash[1] };
  return { main: text };
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="st-segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ '--st-count': options.length } as React.CSSProperties}
    >
      {options.map(opt => {
        const { main, sub } = splitLabel(opt.label);
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            className={`st-segment ${active ? 'is-active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon size={13} />}
            <span className="st-segment-text">
              <span className="st-segment-main">{main}</span>
              {sub && <span className="st-segment-sub">{sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Solid classic teardrop pin matching the map marker 1:1 (no inner hole). */
function PreviewPin({ className, left, top }: { className: string; left: string; top: string }) {
  return (
    <svg
      className={`st-pv-pin ${className}`}
      style={{ left, top }}
      width="17"
      height="24"
      viewBox="0 0 22 31"
    >
      <path
        d="M11 1.2C5.6 1.2 1.5 5.3 1.5 10.6c0 6.1 7.1 16.1 8.8 19.1.35.6 1.05.6 1.4 0 1.7-3 8.8-13 8.8-19.1 0-5.3-4.1-9.4-9.5-9.4Z"
        fill="var(--op)"
        stroke="#1e1e26"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`st-switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="st-switch-knob" />
    </button>
  );
}

function Item({
  icon: Icon,
  title,
  hint,
  control,
  stacked = false,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  control: React.ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`st-item ${stacked ? 'is-stacked' : ''}`}>
      <div className="st-item-head">
        <span className="st-item-icon">
          <Icon size={15} />
        </span>
        <div className="st-item-text">
          <span className="st-item-title">{title}</span>
          {hint && <span className="st-item-hint">{hint}</span>}
        </div>
        {!stacked && <div className="st-item-control">{control}</div>}
      </div>
      {stacked && <div className="st-item-body">{control}</div>}
    </div>
  );
}

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

  const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
    { id: 'markers', label: t.settingsTabMarkers, icon: MapPin },
    { id: 'azimuths', label: t.settingsTabAzimuths, icon: Compass },
    { id: 'navigation', label: t.settingsTabNavigation, icon: Navigation },
    { id: 'system', label: t.settingsTabSystem, icon: MonitorCog },
  ];

  const shapes: { id: MarkerShape; title: string; desc: string; preview: React.ReactNode }[] = [
    {
      id: 'dots',
      title: t.settingsShapeDots,
      desc: t.settingsShapeDotsDesc,
      preview: (
        <>
          <i className="st-pv-dot op-orange" style={{ left: '24%', top: '44%' }} />
          <i className="st-pv-dot op-play" style={{ left: '44%', top: '62%' }} />
          <i className="st-pv-dot op-plus" style={{ left: '63%', top: '36%' }} />
          <i className="st-pv-dot op-tmobile" style={{ left: '79%', top: '56%' }} />
        </>
      ),
    },
    {
      id: 'pins',
      title: t.settingsShapePins,
      desc: t.settingsShapePinsDesc,
      preview: (
        <>
          <PreviewPin className="op-orange" left="25%" top="66%" />
          <PreviewPin className="op-play" left="45%" top="80%" />
          <PreviewPin className="op-plus" left="63%" top="60%" />
          <PreviewPin className="op-tmobile" left="80%" top="74%" />
        </>
      ),
    },
    {
      id: 'badges',
      title: t.settingsShapeBadges,
      desc: t.settingsShapeBadgesDesc,
      preview: (
        <>
          <span className="st-pv-badge" style={{ left: '34%', top: '38%' }}>
            <i className="op-orange" />
            WAR1021
          </span>
          <span className="st-pv-badge" style={{ left: '65%', top: '66%' }}>
            <i className="op-play" />
            KRK0412
          </span>
        </>
      ),
    },
  ];

  return (
    <Modal wide title={t.settingsTitle} onClose={onClose}>
      <div className="st-shell">
        <p className="st-intro">{t.settingsDesc}</p>

        <nav className="st-tabs" role="tablist" aria-label={t.settings}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`st-tab-btn ${active ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="st-panel" role="tabpanel" key={activeTab}>
          {activeTab === 'markers' && (
            <>
              <section className="st-section">
                <div className="st-section-head">
                  <span className="st-section-title">{t.settingsMarkerShape}</span>
                  <span className="st-section-hint">{t.settingsMarkerShapeDesc}</span>
                </div>
                <div className="st-shapes" role="radiogroup" aria-label={t.settingsMarkerShape}>
                  {shapes.map(shape => {
                    const selected = settings.markerShape === shape.id;
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`st-shape ${selected ? 'is-selected' : ''}`}
                        onClick={() => updateSetting('markerShape', shape.id)}
                      >
                        <span className="st-shape-preview" aria-hidden="true">
                          {shape.preview}
                        </span>
                        <span className="st-shape-meta">
                          <strong>{shape.title}</strong>
                          <small>{shape.desc}</small>
                        </span>
                        <span className="st-shape-check" aria-hidden="true">
                          <Check size={11} strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="st-card">
                <Item
                  stacked
                  icon={Maximize2}
                  title={t.settingsMarkerSize}
                  control={
                    <Segmented<MarkerSize>
                      ariaLabel={t.settingsMarkerSize}
                      value={settings.markerSize}
                      onChange={v => updateSetting('markerSize', v)}
                      options={[
                        { value: 'compact', label: t.settingsSizeCompact },
                        { value: 'normal', label: t.settingsSizeNormal },
                        { value: 'large', label: t.settingsSizeLarge },
                      ]}
                    />
                  }
                />
                <Item
                  stacked
                  icon={Tag}
                  title={t.settingsLabels}
                  control={
                    <Segmented<StationLabelsMode>
                      ariaLabel={t.settingsLabels}
                      value={settings.showStationLabels}
                      onChange={v => updateSetting('showStationLabels', v)}
                      options={[
                        { value: 'none', label: t.settingsLabelsNone },
                        { value: 'id', label: t.settingsLabelsId },
                        { value: 'full', label: t.settingsLabelsFull },
                      ]}
                    />
                  }
                />
                <Item
                  icon={Contrast}
                  title={t.settingsHighContrast}
                  hint={t.settingsHighContrastDesc}
                  control={
                    <Switch
                      label={t.settingsHighContrast}
                      checked={settings.highContrastMarkers}
                      onChange={v => updateSetting('highContrastMarkers', v)}
                    />
                  }
                />
              </section>
            </>
          )}

          {activeTab === 'azimuths' && (
            <section className="st-card">
              <Item
                stacked
                icon={Droplet}
                title={t.settingsAzimuthOpacity}
                control={
                  <Segmented<AzimuthOpacity>
                    ariaLabel={t.settingsAzimuthOpacity}
                    value={settings.azimuthOpacity}
                    onChange={v => updateSetting('azimuthOpacity', v)}
                    options={[
                      { value: 0.2, label: t.settingsAzOpacitySubtle },
                      { value: 0.45, label: t.settingsAzOpacityNormal },
                      { value: 0.75, label: t.settingsAzOpacityVibrant },
                    ]}
                  />
                }
              />
              <Item
                stacked
                icon={Ruler}
                title={t.settingsAzimuthLength}
                control={
                  <Segmented<AzimuthLength>
                    ariaLabel={t.settingsAzimuthLength}
                    value={settings.azimuthLength}
                    onChange={v => updateSetting('azimuthLength', v)}
                    options={[
                      { value: 'short', label: t.settingsAzLengthShort },
                      { value: 'normal', label: t.settingsAzLengthNormal },
                      { value: 'long', label: t.settingsAzLengthLong },
                    ]}
                  />
                }
              />
              <Item
                icon={MousePointerClick}
                title={t.settingsAutoAzimuthSelect}
                hint={t.settingsAutoAzimuthSelectDesc}
                control={
                  <Switch
                    label={t.settingsAutoAzimuthSelect}
                    checked={settings.autoShowAzimuthsOnSelect}
                    onChange={v => updateSetting('autoShowAzimuthsOnSelect', v)}
                  />
                }
              />
            </section>
          )}

          {activeTab === 'navigation' && (
            <section className="st-card">
              <Item
                stacked
                icon={Crosshair}
                title={t.settingsCoordFormat}
                control={
                  <Segmented<CoordFormat>
                    ariaLabel={t.settingsCoordFormat}
                    value={settings.coordFormat}
                    onChange={v => updateSetting('coordFormat', v)}
                    options={[
                      { value: 'DD', label: t.settingsCoordDd },
                      { value: 'DMS', label: t.settingsCoordDms },
                    ]}
                  />
                }
              />
              <Item
                icon={Wind}
                title={t.settingsSmoothFlyTo}
                hint={t.settingsSmoothFlyToDesc}
                control={
                  <Switch
                    label={t.settingsSmoothFlyTo}
                    checked={settings.smoothFlyTo}
                    onChange={v => updateSetting('smoothFlyTo', v)}
                  />
                }
              />
              <Item
                icon={Bookmark}
                title={t.settingsRememberLocation}
                hint={t.settingsRememberLocationDesc}
                control={
                  <Switch
                    label={t.settingsRememberLocation}
                    checked={settings.rememberMapLocation}
                    onChange={v => updateSetting('rememberMapLocation', v)}
                  />
                }
              />
            </section>
          )}

          {activeTab === 'system' && (
            <>
              <section className="st-card">
                <Item
                  stacked
                  icon={theme === 'dark' ? Moon : Sun}
                  title={t.settingsTheme}
                  control={
                    <Segmented<Theme>
                      ariaLabel={t.settingsTheme}
                      value={theme}
                      onChange={onThemeChange}
                      options={[
                        { value: 'dark', label: t.settingsThemeDark, icon: Moon },
                        { value: 'light', label: t.settingsThemeLight, icon: Sun },
                      ]}
                    />
                  }
                />
                <Item
                  stacked
                  icon={Languages}
                  title={t.settingsLanguage}
                  control={
                    <Segmented<Lang>
                      ariaLabel={t.settingsLanguage}
                      value={lang}
                      onChange={onLangChange}
                      options={[
                        { value: 'pl', label: 'Polski (PL)' },
                        { value: 'en', label: 'English (EN)' },
                      ]}
                    />
                  }
                />
              </section>
              <section className="st-card st-card-danger">
                <Item
                  icon={HardDrive}
                  title={t.settingsStorageTitle}
                  hint={t.settingsStorageDesc}
                  control={
                    <button type="button" className="st-danger-btn" onClick={handleClearCache}>
                      <Trash2 size={13} />
                      <span>{t.settingsClearCache}</span>
                    </button>
                  }
                />
              </section>
            </>
          )}
        </div>

        <footer className="st-footer">
          <button type="button" className="st-reset-btn" onClick={handleResetDefaults}>
            <RotateCcw size={13} />
            <span>{t.settingsResetDefaults}</span>
          </button>
          <button type="button" className="primary-button" onClick={onClose}>
            <Check size={14} />
            {t.settingsClose}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
