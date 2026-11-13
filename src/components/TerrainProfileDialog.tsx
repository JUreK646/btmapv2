import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  Mountain,
  CheckCircle2,
  XCircle,
  Info,
  Crosshair,
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileX,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import type { Tower } from '../types';
import { api } from '../lib/api';
import { cachedPemReports, loadPemReports, loadPemPdf } from '../lib/pemCache';
import type { PemReport } from '../../shared/pem';
import { operatorColor } from '../../shared/operators';
import type { TerrainProfileResult, TerrainProfilePoint } from '../types';
import { useI18n } from '../lib/i18n';

interface Props {
  tower: Tower;
  targetCoords: [number, number];
  onTargetChange: (coords: [number, number]) => void;
  onSectorAzimuthChange?: (azimuth: number) => void;
  onPickOnMap?: () => void;
  onClose: () => void;
}

interface AntennaOption {
  id: string;
  bandFreq: number;
  bandLabel: string;
  azimuth: number;
  height: number;
  tilt: number;
  source: 'pem' | 'uke';
}

interface SectorData {
  azimuth: number;
  isFacingTarget: boolean;
  bands: AntennaOption[];
}

function bandFreqMhz(s: string): number {
  const m = String(s || '').replace(/^[2345]g\b/i, '').match(/\d{3,4}/) || String(s || '').match(/\d+/);
  return m ? Number(m[0]) : 1800;
}

function formatPl(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toFixed(digits).replace('.', ',');
}

function getCardinalDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

export default function TerrainProfileDialog({
  tower,
  targetCoords,
  onSectorAzimuthChange,
  onPickOnMap,
  onClose,
}: Props) {
  const { lang } = useI18n();
  const isEn = lang === 'en';
  const primaryOp = tower.operators[0]?.name || 'UKE';
  const opColor = operatorColor(primaryOp);

  // Minimize panel state
  const [isMinimized, setIsMinimized] = useState(false);

  // Antenna and Sector selection
  const [pemReport, setPemReport] = useState<PemReport | null>(null);
  const [pemLoading, setPemLoading] = useState(true);
  const [pemNotFound, setPemNotFound] = useState(false);
  const [manualSector, setManualSector] = useState<number | null>(null);
  const [selectedFreq, setSelectedFreq] = useState<number | null>(null);
  const [autoSelect, setAutoSelect] = useState(true);
  const [showAllAntennas, setShowAllAntennas] = useState(false);

  // Network generation of a band, from what the station itself lists ("5G" for 700 MHz NR, "4G" for LTE 800…).
  const bandGeneration = useCallback((freq: number): string | null => {
    const order: Record<string, number> = { '2G': 2, '3G': 3, '4G': 4, '5G': 5 };
    const genOf = (tech: string) => {
      const t = tech.toUpperCase();
      if (t === '5G' || t === 'NR') return '5G';
      if (t === 'LTE') return '4G';
      if (t === 'UMTS') return '3G';
      if (t === 'GSM') return '2G';
      return null;
    };
    let best: string | null = null;
    for (const op of tower.operators) {
      for (const b of op.bands || []) {
        if (bandFreqMhz(b.band) !== freq) continue;
        const gen = genOf(String(b.tech || ''));
        if (gen && (!best || order[gen] > order[best])) best = gen;
      }
    }
    return best;
  }, [tower.operators]);

  // Receiver options
  const [rxHeight, setRxHeight] = useState<number>(5);

  // Calculation state
  const [profile, setProfile] = useState<TerrainProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Interactive chart hover
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Fetch verified SI2PEM report to get real physical antennas, heights, tilts and azimuths
  useEffect(() => {
    let active = true;

    const load = async () => {
      setPemLoading(true);
      setPemNotFound(false);

      const candidateOps: string[] = [];
      if (tower.operators && tower.operators.length > 0) {
        for (const op of tower.operators) {
          if (op.name && !candidateOps.includes(op.name)) {
            candidateOps.push(op.name);
          }
        }
      }
      if (candidateOps.length === 0) {
        candidateOps.push('');
      }

      let foundReportWithAntennas: PemReport | null = null;
      let foundAnyPemReport: PemReport | null = null;

      for (const opName of candidateOps) {
        if (!active) return;
        try {
          const cached = cachedPemReports(tower, opName);
          const res = cached || (await loadPemReports(tower, opName));
          if (!active) return;

          if (res && res.reports && res.reports.length > 0) {
            if (!foundAnyPemReport) {
              foundAnyPemReport = res.reports[0];
            }

            const pdfReports = res.reports.filter(r => r.kind === 'pdf');
            if (pdfReports.length > 0) {
              // Parse all PDF reports in parallel to find the one with the antenna table
              const parsedPdfs = await Promise.all(
                pdfReports.map(pdf => loadPemPdf(tower, opName, pdf).catch(() => null))
              );
              if (!active) return;

              const matchWithAntennas = parsedPdfs.find(p => p && p.antennas && p.antennas.length > 0);
              if (matchWithAntennas) {
                foundReportWithAntennas = matchWithAntennas;
                break;
              } else {
                const firstParsed = parsedPdfs.find(p => p !== null);
                if (firstParsed && !foundAnyPemReport) {
                  foundAnyPemReport = firstParsed;
                }
              }
            }
          }
        } catch {
          // Check next co-located operator if available
        }
      }

      if (!active) return;

      const finalReport = foundReportWithAntennas || foundAnyPemReport;

      if (finalReport) {
        setPemReport(finalReport);
        setPemLoading(false);
        setPemNotFound(false);
      } else {
        // Double check if tower has any recorded SI2PEM reports in metadata
        const hasRecordedPem =
          tower.pemReportsByOperator &&
          Object.values(tower.pemReportsByOperator).some(entry => entry.count > 0);

        if (hasRecordedPem) {
          const firstOpWithCount = Object.entries(tower.pemReportsByOperator!).find(([, v]) => v.count > 0);
          setPemReport({
            id: 'registered-pem',
            number: 'Zarejestrowane pomiary SI2PEM',
            date: firstOpWithCount?.[1]?.checkedAt?.slice(0, 10) || null,
            laboratory: 'SI2PEM',
            operator: firstOpWithCount?.[0] || primaryOp,
            stationIds: [tower.stationId || tower.id],
            downloadUrl: `https://si2pem.gov.pl/pomiar/?search=${encodeURIComponent(tower.stationId || tower.id)}`,
            antennas: [],
            measurements: [],
          });
          setPemLoading(false);
          setPemNotFound(false);
        } else {
          setPemReport(null);
          setPemLoading(false);
          setPemNotFound(true);
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [tower.id, primaryOp, tower.operators, tower.pemReportsByOperator]);

  // Bearing from tower to receiver
  const targetBearing = useMemo(() => {
    const dLat = (targetCoords[0] - tower.lat) * (Math.PI / 180);
    const dLng = (targetCoords[1] - tower.lng) * (Math.PI / 180);
    const y = Math.sin(dLng) * Math.cos(targetCoords[0] * (Math.PI / 180));
    const x =
      Math.cos(tower.lat * (Math.PI / 180)) * Math.sin(targetCoords[0] * (Math.PI / 180)) -
      Math.sin(tower.lat * (Math.PI / 180)) * Math.cos(targetCoords[0] * (Math.PI / 180)) * Math.cos(dLng);
    return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
  }, [tower.lat, tower.lng, targetCoords]);

  // Direct haversine distance from tower to receiver
  const directDistanceKm = useMemo(() => {
    const dLat = (targetCoords[0] - tower.lat) * (Math.PI / 180);
    const dLng = (targetCoords[1] - tower.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(tower.lat * (Math.PI / 180)) * Math.cos(targetCoords[0] * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [tower.lat, tower.lng, targetCoords]);

  // Extract real physical sectors and unique frequency bands strictly from SI2PEM report
  const sectors = useMemo<SectorData[]>(() => {
    if (!pemReport) return [];

    const sectorMap = new Map<number, AntennaOption[]>();

    if (pemReport.antennas && pemReport.antennas.length > 0) {
      for (const ant of pemReport.antennas) {
        if (ant.azimuth === null || !Number.isFinite(ant.azimuth)) continue;
        const az = Math.round(ant.azimuth) % 360;
        const h = ant.height ?? tower.height ?? 35;
        const defaultTilt = ant.tilt ?? 3;

        for (const b of ant.bands || ['1800']) {
          const f = bandFreqMhz(b);
          const specificTilt =
            ant.settings?.find(s => bandFreqMhz(s.band) === f)?.tilt ?? defaultTilt;

          if (!sectorMap.has(az)) sectorMap.set(az, []);
          sectorMap.get(az)!.push({
            id: `${ant.id}-${f}`,
            bandFreq: f,
            bandLabel: `${f} MHz`,
            azimuth: az,
            height: h,
            tilt: specificTilt,
            source: 'pem',
          });
        }
      }
    }

    // If report exists but PDF is a scan without parsed antennas,
    // generate nominal sector facing target using the station's frequency bands
    if (sectorMap.size === 0) {
      const az = Math.round(targetBearing);
      const h = tower.height ?? 35;
      const bandsList: AntennaOption[] = [];

      const towerBands = tower.operators.flatMap(o => o.bands || []);
      const uniqueFreqs = new Set<number>();
      for (const tb of towerBands) {
        const f = bandFreqMhz(tb.band);
        if (f > 0 && !uniqueFreqs.has(f)) {
          uniqueFreqs.add(f);
          bandsList.push({
            id: `scan-${f}`,
            bandFreq: f,
            bandLabel: `${f} MHz`,
            azimuth: az,
            height: h,
            tilt: 3,
            source: 'pem',
          });
        }
      }

      if (bandsList.length === 0) {
        bandsList.push({
          id: 'scan-1800',
          bandFreq: 1800,
          bandLabel: '1800 MHz',
          azimuth: az,
          height: h,
          tilt: 3,
          source: 'pem',
        });
      }

      return [
        {
          azimuth: az,
          isFacingTarget: true,
          bands: bandsList.sort((a, b) => a.bandFreq - b.bandFreq),
        },
      ];
    }

    const sortedAzimuths = [...sectorMap.keys()].sort((a, b) => a - b);

    // Find best sector (smallest angular deviation to target bearing)
    let closestAz = sortedAzimuths[0];
    let minDiff = 999;
    for (const az of sortedAzimuths) {
      let diff = Math.abs(az - targetBearing) % 360;
      if (diff > 180) diff = 360 - diff;
      if (diff < minDiff) {
        minDiff = diff;
        closestAz = az;
      }
    }

    const result: SectorData[] = [];
    for (const az of sortedAzimuths) {
      const rawBands = sectorMap.get(az) || [];
      const byFreq = new Map<number, AntennaOption>();
      for (const item of rawBands) {
        if (!byFreq.has(item.bandFreq)) {
          byFreq.set(item.bandFreq, item);
        }
      }
      const uniqueBands = [...byFreq.values()].sort((a, b) => a.bandFreq - b.bandFreq);
      result.push({
        azimuth: az,
        isFacingTarget: az === closestAz,
        bands: uniqueBands,
      });
    }

    return result;
  }, [pemReport, tower.height, tower.operators, targetBearing]);

  // Closest sector azimuth facing the receiver
  const closestSectorAzimuth = useMemo(() => {
    const match = sectors.find(s => s.isFacingTarget);
    return match ? match.azimuth : sectors[0]?.azimuth ?? 0;
  }, [sectors]);

  // Currently active sector azimuth (automatically picks the best sector facing target)
  const activeSector = autoSelect || manualSector === null ? closestSectorAzimuth : manualSector;

  // Active sector data and unique bands
  const currentSectorData = useMemo(() => {
    return sectors.find(s => s.azimuth === activeSector) || sectors[0];
  }, [sectors, activeSector]);

  const activeSectorBands = currentSectorData?.bands || [];

  // Active selected antenna option
  const activeAntenna = useMemo<AntennaOption>(() => {
    if (!activeSectorBands.length) {
      return {
        id: 'default',
        bandFreq: 1800,
        bandLabel: '1800 MHz',
        azimuth: activeSector,
        height: tower.height ?? 35,
        tilt: 3,
        source: 'pem',
      };
    }

    if (selectedFreq !== null) {
      const match = activeSectorBands.find(b => b.bandFreq === selectedFreq);
      if (match) return match;
    }

    return activeSectorBands[0];
  }, [activeSectorBands, selectedFreq, activeSector, tower.height]);

  // Notify parent of active sector azimuth to align map beam cone
  useEffect(() => {
    if (onSectorAzimuthChange && activeAntenna.azimuth !== undefined) {
      onSectorAzimuthChange(activeAntenna.azimuth);
    }
  }, [activeAntenna.azimuth, onSectorAzimuthChange]);

  // Fetch real LiDAR terrain profile from GUGiK Geoportal (only when verified SI2PEM report exists)
  const loadProfile = useCallback((bareOnly = false) => {
    if (!pemReport || sectors.length === 0) return;
    setLoading(true);
    setError('');

    const query = new URLSearchParams({
      lat1: String(tower.lat),
      lng1: String(tower.lng),
      lat2: String(targetCoords[0]),
      lng2: String(targetCoords[1]),
      txHeight: String(activeAntenna.height),
      rxHeight: String(rxHeight),
      freq: String(activeAntenna.bandFreq),
      azimuth: String(activeAntenna.azimuth),
      tilt: String(activeAntenna.tilt),
      samples: '60',
      surface: bareOnly ? '0' : '1',
    });

    api<TerrainProfileResult>(`/terrain-profile?${query.toString()}`)
      .then(res => {
        setProfile(res);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || 'Nie udało się pobrać profilu terenu z serwisu GUGiK.');
        setLoading(false);
      });
  }, [tower.lat, tower.lng, targetCoords, activeAntenna, rxHeight, pemReport, sectors.length]);

  useEffect(() => {
    if (pemReport && sectors.length > 0) {
      loadProfile(false);
    }
  }, [pemReport, sectors.length, loadProfile]);

  // LiDAR Canvas Profile Chart Dimensions & High-DPI DPR Setup
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 840, height: 255 });
  const [isDark, setIsDark] = useState(true);

  // Synchronize dark/light mode for canvas palette
  useEffect(() => {
    const updateTheme = () => {
      const docTheme = document.documentElement.getAttribute('data-theme');
      if (docTheme === 'light') {
        setIsDark(false);
      } else if (docTheme === 'dark') {
        setIsDark(true);
      } else {
        setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  // Responsive ResizeObserver for canvas container to prevent stretching/overflowing.
  // The chart area only exists once the SI2PEM check is done and the panel is expanded, so the
  // observer is (re)attached then; attached only at mount it never saw the chart and kept 840×255.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          setCanvasSize({
            width: Math.floor(cr.width),
            height: Math.floor(cr.height),
          });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [pemLoading, pemNotFound, isMinimized]);

  // Vertical exaggeration calculation
  const exaggeration = useMemo(() => {
    if (!profile || !profile.points.length) return '4,0';
    const padLeft = canvasSize.width < 480 ? 46 : 56;
    const innerW = Math.max(10, canvasSize.width - padLeft - 36);
    const innerH = Math.max(10, canvasSize.height - 32 - 30);
    const yMin = Math.max(0, Math.floor((profile.minElevation - 8) / 10) * 10);
    const yMax = Math.ceil((profile.maxElevation + 16) / 10) * 10;
    const ySpan = Math.max(25, yMax - yMin);
    const maxDist = Math.max(0.01, profile.distanceKm);

    const pxPerMeterY = innerH / ySpan;
    const pxPerMeterX = innerW / (maxDist * 1000);
    const exag = Math.max(1, (pxPerMeterY / Math.max(0.0001, pxPerMeterX)) * 0.45);
    return formatPl(exag, 1);
  }, [profile, canvasSize]);

  // High-DPI DPR Canvas Rendering Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !profile || !profile.points.length) return;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = Math.max(260, canvasSize.width);
    const cssH = Math.max(180, canvasSize.height);

    // Canvas buffer sizing with DPR scaling
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = {
      top: 32,
      right: 36,
      bottom: 30,
      left: cssW < 480 ? 46 : 56,
    };
    const innerW = Math.max(10, cssW - pad.left - pad.right);
    const innerH = Math.max(10, cssH - pad.top - pad.bottom);
    const pts = profile.points;
    const maxDist = Math.max(0.01, profile.distanceKm);

    const yMin = Math.max(0, Math.floor((profile.minElevation - 8) / 10) * 10);
    const yMax = Math.ceil((profile.maxElevation + 16) / 10) * 10;
    const ySpan = Math.max(25, yMax - yMin);

    const scaleX = (distKm: number) => pad.left + (distKm / maxDist) * innerW;
    const scaleY = (altM: number) => pad.top + innerH - ((altM - yMin) / ySpan) * innerH;

    // Palette tokens
    const axisColor = isDark ? '#94a3b8' : '#64748b';
    const spineColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.2)';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(148, 163, 184, 0.22)';
    const rayColor = isDark ? '#38bdf8' : '#0284c7';
    const groundStroke = isDark ? '#334155' : '#64748b';
    const groundTop = isDark ? '#1b2333' : '#cbd5e1';
    const groundMid = isDark ? '#131926' : '#e2e8f0';
    const groundBottom = isDark ? '#090d14' : '#f8fafc';
    const clutterStroke = '#10b981';
    const mastColor = isDark ? '#10b981' : '#0f766e';
    const hazardColor = '#f43f5e';

    // 1. Horizontal Y Grid & Elevation Axis
    const yTicks: number[] = [];
    const yStep = ySpan > 120 ? 40 : ySpan > 70 ? 20 : 10;
    for (let y = yMin; y <= yMax; y += yStep) {
      yTicks.push(y);
    }

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = gridLineColor;
    for (const y of yTicks) {
      const py = scaleY(y);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(cssW - pad.right, py);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Vertical X Grid & Distance Axis
    const xTicks: number[] = [];
    const maxXTicks = innerW < 400 ? 4 : innerW < 600 ? 6 : 8;
    const rawStep = maxDist / maxXTicks;
    const niceSteps = [0.1, 0.2, 0.5, 1, 2, 4, 5, 10, 20, 50];
    const xStep = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep);
    for (let x = 0; x <= maxDist; x += xStep) {
      xTicks.push(Math.round(x * 10) / 10);
    }
    const lastTick = xTicks[xTicks.length - 1];
    const roundedMax = Math.round(maxDist * 10) / 10;
    if (roundedMax - lastTick >= xStep * 0.5) {
      xTicks.push(roundedMax);
    } else if (roundedMax > lastTick && xTicks.length > 1) {
      xTicks[xTicks.length - 1] = roundedMax;
    }

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = gridLineColor;
    for (const x of xTicks) {
      const px = scaleX(x);
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, cssH - pad.bottom);
      ctx.stroke();
    }
    ctx.restore();

    // Draw Axis Spines
    ctx.save();
    ctx.strokeStyle = spineColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, cssH - pad.bottom);
    ctx.lineTo(cssW - pad.right, cssH - pad.bottom);
    ctx.stroke();
    ctx.restore();

    // Draw Y Axis Labels (Elevation in m n.p.m.)
    ctx.save();
    ctx.fillStyle = axisColor;
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('m n.p.m.', pad.left - 6, pad.top - 8);

    ctx.textBaseline = 'middle';
    for (const y of yTicks) {
      const py = scaleY(y);
      ctx.beginPath();
      ctx.strokeStyle = spineColor;
      ctx.moveTo(pad.left - 4, py);
      ctx.lineTo(pad.left, py);
      ctx.stroke();
      ctx.fillText(String(y), pad.left - 7, py);
    }
    ctx.restore();

    // Draw X Axis Labels (Distance in km)
    ctx.save();
    ctx.fillStyle = axisColor;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const x of xTicks) {
      const px = scaleX(x);
      ctx.beginPath();
      ctx.strokeStyle = spineColor;
      ctx.moveTo(px, cssH - pad.bottom);
      ctx.lineTo(px, cssH - pad.bottom + 4);
      ctx.stroke();
      ctx.fillText(x === 0 ? '0 km' : `${formatPl(x, 1)} km`, px, cssH - pad.bottom + 6);
    }
    ctx.restore();

    // 3. 1st Fresnel Zone Envelope (100% F1)
    ctx.save();
    const fresnelGrad = ctx.createLinearGradient(0, pad.top, 0, cssH - pad.bottom);
    fresnelGrad.addColorStop(0, isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)');
    fresnelGrad.addColorStop(0.5, isDark ? 'rgba(56, 189, 248, 0.03)' : 'rgba(2, 132, 199, 0.03)');
    fresnelGrad.addColorStop(1, isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)');

    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = scaleX(p.distanceKm);
      const py = scaleY(p.rayHeight - p.fresnelRadius);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      const px = scaleX(p.distanceKm);
      const py = scaleY(p.rayHeight + p.fresnelRadius);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fresnelGrad;
    ctx.fill();

    // Lower F1 dashed line
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(2, 132, 199, 0.45)';
    ctx.lineWidth = 1;
    pts.forEach((p, i) => {
      const px = scaleX(p.distanceKm);
      const py = scaleY(p.rayHeight - p.fresnelRadius);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // 60% Fresnel clearance boundary line
    ctx.beginPath();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.65)' : 'rgba(2, 132, 199, 0.65)';
    ctx.lineWidth = 0.9;
    pts.forEach((p, i) => {
      const px = scaleX(p.distanceKm);
      const py = scaleY(p.rayHeight - 0.6 * p.fresnelRadius);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // 4. NMPT Surface Canopy (Real LiDAR Vegetation & Buildings)
    if (profile.nmptAvailable) {
      ctx.save();
      const clutterGrad = ctx.createLinearGradient(0, pad.top, 0, cssH - pad.bottom);
      clutterGrad.addColorStop(0, isDark ? 'rgba(16, 185, 129, 0.42)' : 'rgba(16, 185, 129, 0.38)');
      clutterGrad.addColorStop(1, isDark ? 'rgba(4, 120, 87, 0.1)' : 'rgba(4, 120, 87, 0.12)');

      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = scaleX(p.distanceKm);
        const py = scaleY(p.totalGround);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        const px = scaleX(p.distanceKm);
        const py = scaleY(p.elevation + p.curvDrop);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = clutterGrad;
      ctx.fill();

      // Canopy crest line
      ctx.beginPath();
      ctx.strokeStyle = clutterStroke;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      pts.forEach((p, i) => {
        const px = scaleX(p.distanceKm);
        const py = scaleY(p.totalGround);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 5. Bare-Earth Geological Ground (NMT 1m GUGiK)
    ctx.save();
    const groundGrad = ctx.createLinearGradient(0, pad.top, 0, cssH - pad.bottom);
    groundGrad.addColorStop(0, groundTop);
    groundGrad.addColorStop(0.6, groundMid);
    groundGrad.addColorStop(1, groundBottom);

    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = scaleX(p.distanceKm);
      const py = scaleY(p.elevation + p.curvDrop);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.lineTo(scaleX(maxDist), scaleY(yMin));
    ctx.lineTo(scaleX(0), scaleY(yMin));
    ctx.closePath();
    ctx.fillStyle = groundGrad;
    ctx.fill();

    // Ground contour line
    ctx.beginPath();
    ctx.strokeStyle = groundStroke;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    pts.forEach((p, i) => {
      const px = scaleX(p.distanceKm);
      const py = scaleY(p.elevation + p.curvDrop);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // 6. Direct Line-of-Sight Ray
    const txX = scaleX(0);
    const txY = scaleY(profile.txTotalAlt);
    const txGroundY = scaleY(profile.txElevation);
    const rxX = scaleX(maxDist);
    const rxY = scaleY(profile.rxTotalAlt);
    const rxGroundY = scaleY(profile.rxElevation + (pts[pts.length - 1]?.curvDrop || 0));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(txX, txY);
    ctx.lineTo(rxX, rxY);
    ctx.strokeStyle = rayColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    // 7. Obstacle Collision Regions (where totalGround > rayHeight)
    const obsPolys: { top: [number, number][]; bot: [number, number][] }[] = [];
    let currObs: { top: [number, number][]; bot: [number, number][] } | null = null;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.totalGround > p.rayHeight) {
        if (!currObs) currObs = { top: [], bot: [] };
        currObs.top.push([scaleX(p.distanceKm), scaleY(p.totalGround)]);
        currObs.bot.push([scaleX(p.distanceKm), scaleY(p.rayHeight)]);
      } else if (currObs) {
        if (currObs.top.length >= 2) obsPolys.push(currObs);
        currObs = null;
      }
    }
    if (currObs && currObs.top.length >= 2) obsPolys.push(currObs);

    for (const op of obsPolys) {
      ctx.save();
      ctx.beginPath();
      op.top.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt[0], pt[1]);
        else ctx.lineTo(pt[0], pt[1]);
      });
      for (let idx = op.bot.length - 1; idx >= 0; idx--) {
        ctx.lineTo(op.bot[idx][0], op.bot[idx][1]);
      }
      ctx.closePath();

      const hGrad = ctx.createLinearGradient(0, pad.top, 0, cssH - pad.bottom);
      hGrad.addColorStop(0, 'rgba(244, 63, 94, 0.42)');
      hGrad.addColorStop(1, 'rgba(159, 18, 57, 0.15)');
      ctx.fillStyle = hGrad;
      ctx.fill();

      // Clip & draw diagonal hazard hatching
      ctx.clip();
      ctx.beginPath();
      ctx.strokeStyle = hazardColor;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.55;
      const hatchStep = 8;
      for (let hx = pad.left - cssH; hx < cssW + cssH; hx += hatchStep) {
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx + innerH, cssH - pad.bottom);
      }
      ctx.stroke();
      ctx.restore();

      // Hazard top crest stroke
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 2]);
      ctx.strokeStyle = hazardColor;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      op.top.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt[0], pt[1]);
        else ctx.lineTo(pt[0], pt[1]);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 8. Obstacle Vertical Marker & Pill Badge
    if (profile.isObstructed && profile.obstructionDistKm > 0) {
      const obsDist = profile.obstructionDistKm;
      const obsX = scaleX(obsDist);
      const obsPt = pts.find(p => Math.abs(p.distanceKm - obsDist) < 0.25) || pts[Math.floor(pts.length / 2)];
      const obsRayY = obsPt ? scaleY(obsPt.rayHeight) : (txY + rxY) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = hazardColor;
      ctx.lineWidth = 1.4;
      ctx.moveTo(obsX, pad.top);
      ctx.lineTo(obsX, cssH - pad.bottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(obsX, obsRayY, 4, 0, Math.PI * 2);
      ctx.fillStyle = hazardColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const badgeText = `Kolizja ${formatPl(profile.obstructionDistKm, 2)} km (-${formatPl(profile.obstructionMaxM, 1)} m)`;
      ctx.font = '700 10.5px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(badgeText).width;
      const pillW = textWidth + 20;
      const pillH = 20;
      const pillX = Math.min(cssW - pad.right - pillW, Math.max(pad.left + 8, obsX - pillW / 2));
      const pillY = Math.max(4, pad.top - 24);

      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 10);
      ctx.fillStyle = isDark ? 'rgba(30, 10, 16, 0.92)' : 'rgba(255, 241, 242, 0.96)';
      ctx.fill();
      ctx.strokeStyle = hazardColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = hazardColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
      ctx.restore();
    }

    // 9. TX Station Lattice Mast Tower
    ctx.save();
    ctx.strokeStyle = mastColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;

    ctx.beginPath();
    ctx.moveTo(txX - 4, txGroundY);
    ctx.lineTo(txX - 1.5, txY + 2);
    ctx.moveTo(txX + 4, txGroundY);
    ctx.lineTo(txX + 1.5, txY + 2);
    ctx.stroke();

    const tierCount = Math.max(1, Math.floor((txGroundY - txY) / 14));
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.65;
    for (let idx = 0; idx < tierCount; idx++) {
      const tierY = txGroundY - (idx + 1) * 14;
      if (tierY <= txY + 4) break;
      ctx.beginPath();
      ctx.moveTo(txX - 3, tierY);
      ctx.lineTo(txX + 3, tierY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = opColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(txX - 2.5, txY - 6, 5, 12, 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(txX, txY, 4, 0, Math.PI * 2);
    ctx.fillStyle = rayColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const txBadgeText = `${tower.stationId || 'Stacja'} (${formatPl(profile.txHeight, 1)} m n.p.t.)`;
    ctx.font = '700 10px "Manrope", system-ui, sans-serif';
    const txBadgeW = ctx.measureText(txBadgeText).width + 16;
    const txBadgeH = 20;
    const txBadgeX = Math.min(cssW - pad.right - txBadgeW, txX + 10);
    const txBadgeY = Math.max(pad.top + 2, Math.min(cssH - pad.bottom - 22, txY - 10));

    ctx.beginPath();
    ctx.roundRect(txBadgeX, txBadgeY, txBadgeW, txBadgeH, 6);
    ctx.fillStyle = isDark ? 'rgba(11, 15, 23, 0.92)' : 'rgba(255, 255, 255, 0.96)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txBadgeText, txBadgeX + txBadgeW / 2, txBadgeY + txBadgeH / 2 + 0.5);
    ctx.restore();

    // 10. RX Receiver Terminal Station
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = rayColor;
    ctx.lineWidth = 2.2;
    ctx.moveTo(rxX, rxGroundY);
    ctx.lineTo(rxX, rxY);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = rayColor;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.moveTo(rxX - 4, rxY - 4);
    ctx.lineTo(rxX, rxY);
    ctx.lineTo(rxX - 4, rxY + 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rxX, rxY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const rxBadgeText = `Odbiornik (${formatPl(profile.rxHeight, 1)} m n.p.t.)`;
    ctx.font = '700 10px "Manrope", system-ui, sans-serif';
    const rxBadgeW = ctx.measureText(rxBadgeText).width + 16;
    const rxBadgeH = 20;
    const rxBadgeX = Math.max(pad.left + 8, rxX - rxBadgeW - 10);
    const rxBadgeY = Math.max(pad.top + 2, Math.min(cssH - pad.bottom - 22, rxY - 10));

    ctx.beginPath();
    ctx.roundRect(rxBadgeX, rxBadgeY, rxBadgeW, rxBadgeH, 6);
    ctx.fillStyle = isDark ? 'rgba(11, 15, 23, 0.92)' : 'rgba(255, 255, 255, 0.96)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = rayColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rxBadgeText, rxBadgeX + rxBadgeW / 2, rxBadgeY + rxBadgeH / 2 + 0.5);
    ctx.restore();

    // 11. Interactive Hover Crosshair & Data Markers
    if (hoverIndex !== null && pts[hoverIndex]) {
      const hp = pts[hoverIndex];
      const hx = scaleX(hp.distanceKm);
      const hyGround = scaleY(hp.elevation + hp.curvDrop);
      const hyClutter = scaleY(hp.totalGround);
      const hyRay = scaleY(hp.rayHeight);

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.lineWidth = 1.2;
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, cssH - pad.bottom);
      ctx.stroke();

      // Ground dot
      ctx.beginPath();
      ctx.arc(hx, hyGround, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = groundStroke;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Clutter dot if available
      if (profile.nmptAvailable && hp.clutter > 0) {
        ctx.beginPath();
        ctx.arc(hx, hyClutter, 4, 0, Math.PI * 2);
        ctx.fillStyle = hp.isObstacle ? '#f43f5e' : '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Ray dot
      ctx.beginPath();
      ctx.arc(hx, hyRay, 4, 0, Math.PI * 2);
      ctx.fillStyle = rayColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [profile, canvasSize, hoverIndex, isDark, opColor, tower, activeAntenna]);

  // Handle chart hover & touch scrubbing
  const updateHoverAtClientX = useCallback(
    (clientX: number) => {
      if (!profile || !profile.points.length || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const padLeft = rect.width < 480 ? 46 : 56;
      const padRight = 36;
      const innerW = Math.max(10, rect.width - padLeft - padRight);

      if (cssX < padLeft || cssX > rect.width - padRight) {
        setHoverIndex(null);
        return;
      }
      const t = Math.max(0, Math.min(1, (cssX - padLeft) / innerW));
      const hoverDistKm = t * profile.distanceKm;

      let closestIdx = 0;
      let minD = 999;
      for (let i = 0; i < profile.points.length; i++) {
        const d = Math.abs(profile.points[i].distanceKm - hoverDistKm);
        if (d < minD) {
          minD = d;
          closestIdx = i;
        }
      }
      setHoverIndex(closestIdx);
    },
    [profile]
  );

  const handleChartMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    updateHoverAtClientX(e.clientX);
  };

  const handleChartTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches && e.touches[0]) {
      updateHoverAtClientX(e.touches[0].clientX);
    }
  };

  const hoveredPoint: TerrainProfilePoint | null =
    profile && hoverIndex !== null && profile.points[hoverIndex] ? profile.points[hoverIndex] : null;

  return (
    <aside
      className={`tp-bottom-dock tp-dialog-dock ${isMinimized ? 'is-minimized' : ''}`}
      style={{ '--tp-op-color': opColor } as React.CSSProperties}
      role="region"
      aria-label={isEn ? 'Terrain profile & line of sight analysis' : 'Analiza profilu terenu i widoczności radiowej'}
    >
      <header className="tp-header">
        <div className="tp-header-left">
          <span className="tp-hd-title">
            <Mountain size={15} />
            {isEn ? 'Terrain profile' : 'Profil terenu'}
          </span>
          <span className="tp-hd-sep" aria-hidden="true" />
          <span className="tp-hd-op">
            <i style={{ background: opColor }} aria-hidden="true" />
            {primaryOp}
          </span>
          <span className="tp-hd-id">{tower.stationId || tower.id}</span>
          <span className="tp-hd-addr">
            {tower.address}
            {tower.mastType ? ` - ${tower.mastType}` : ''}
          </span>
        </div>

        <div className="tp-header-right">
          <button
            type="button"
            className="tp-icon-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? (isEn ? 'Expand profile panel' : 'Rozwiń panel profilu') : (isEn ? 'Collapse panel to bar' : 'Zwiń panel do paska')}
            aria-label={isMinimized ? (isEn ? 'Expand profile panel' : 'Rozwiń panel profilu') : (isEn ? 'Collapse panel to bar' : 'Zwiń panel do paska')}
          >
            {isMinimized ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          <button
            type="button"
            className="tp-icon-btn"
            onClick={onClose}
            title={isEn ? 'Close terrain profile' : 'Zamknij profil terenu'}
            aria-label={isEn ? 'Close terrain profile' : 'Zamknij profil terenu'}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      {!isMinimized && (
        pemLoading ? (
          <div className="tp-pem-loading-view">
            <div className="tp-pem-loading-card">
              <RefreshCw size={26} className="tp-spin tp-loading-icon" />
              <div className="tp-pem-loading-info">
                <h4>Weryfikacja danych technicznych stacji w rejestrze SI2PEM…</h4>
                <p>
                  Pobieranie oficjalnych parametrów fizycznych anten (azymuty sektorów, wysokości zawieszenia n.p.t., tilty) ze sprawozdań Instytutu Łączności dla stacji <strong>{tower.stationId || tower.id}</strong> ({primaryOp}).
                </p>
              </div>
            </div>
          </div>
        ) : pemNotFound ? (
          <div className="tp-no-pem-view">
            <div className="tp-no-pem-card">
              <div className="tp-no-pem-icon-circle">
                <FileX size={34} />
              </div>
              <div className="tp-no-pem-info">
                <div className="tp-no-pem-chip">
                  <ShieldAlert size={12} />
                  <span>Wymagany oficjalny raport</span>
                </div>
                <h3 className="tp-no-pem-title">Brak pomiaru SI2PEM dla tej stacji</h3>
                <p className="tp-no-pem-text">
                  Dla stacji <strong>{tower.stationId || tower.id}</strong> ({tower.address}) w państwowym systemie <strong>SI2PEM</strong> (Instytut Łączności) nie opublikowano dotąd sprawozdania z akredytowanych pomiarów pól elektromagnetycznych zawierającego dane techniczne anten.
                </p>
                <div className="tp-no-pem-guarantee">
                  <Info size={16} className="tp-guarantee-icon" />
                  <div>
                    <strong>Zasada rzetelności danych BTMap (Zero-fikcji)</strong>
                    <p>
                      Wiarygodny profil terenu i tłumienia wiązki wymaga rzeczywistych parametrów nadawczych (dokładne azymuty sektorów, wysokość n.p.t. i kąty tilt). Zgodnie z zasadą zero-fikcji BTMap nie wykonuje obliczeń na domysłach lub zmyślonych sektorach.
                    </p>
                  </div>
                </div>
                <div className="tp-no-pem-actions">
                  {onPickOnMap && (
                    <button type="button" className="tp-action-btn primary" onClick={onPickOnMap}>
                      <Crosshair size={14} />
                      <span>Zmień punkt na mapie</span>
                    </button>
                  )}
                  <a
                    href={`https://si2pem.gov.pl/pomiar/?search=${encodeURIComponent(tower.stationId || tower.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tp-action-btn secondary"
                  >
                    <span>Szukaj w portalu SI2PEM</span>
                    <ExternalLink size={13} />
                  </a>
                  <button type="button" className="tp-action-btn ghost" onClick={onClose}>
                    Zamknij panel
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="tp-body">
            <section className="tp-sidebar">
              {/* Verdict */}
              <div className={`tp-verdict ${loading ? 'is-loading' : error ? 'is-error' : profile?.isObstructed ? 'is-obstructed' : profile ? 'is-clear' : ''}`}>
                <div className="tp-verdict-head">
                  <span className="tp-verdict-icon">
                    {loading ? <RefreshCw size={16} className="tp-spin" /> : error ? <AlertTriangle size={16} /> : profile?.isObstructed ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                  </span>
                  <strong>
                    {loading
                      ? (isEn ? 'Calculating the profile…' : 'Obliczanie profilu…')
                      : error
                      ? (isEn ? 'Profile unavailable' : 'Profil niedostępny')
                      : profile?.isObstructed
                      ? (isEn ? 'The modelled path is obstructed' : 'Modelowana trasa jest przesłonięta')
                      : (isEn ? 'Clear line of sight' : 'Czysta linia wzroku')}
                  </strong>
                </div>
                <span className="tp-verdict-mono">
                  {formatPl(profile?.distanceKm ?? directDistanceKm, 2)} km · {isEn ? 'azimuth' : 'azymut'} {formatPl(profile?.azimuthDeg ?? targetBearing, 1)}°
                </span>
                {!loading && profile && (
                  <span className="tp-verdict-detail">
                    {profile.isObstructed ? (
                      <>
                        {isEn ? 'Obstruction up to' : 'Przesłonięcie do'} <b>{formatPl(profile.obstructionMaxM, 1)} m</b> · {formatPl(profile.obstructionDistKm, 2)} km {isEn ? 'from the station' : 'od stacji'}
                      </>
                    ) : (
                      isEn ? 'The first Fresnel zone is free along the whole path' : 'Pierwsza strefa Fresnela wolna na całej trasie'
                    )}
                  </span>
                )}
                {!loading && profile && (profile.isObstructed || !profile.nmptAvailable) && (
                  <p className="tp-verdict-note">
                    <AlertTriangle size={13} />
                    <span>
                      {profile.isClutterObstructed && !profile.isTerrainObstructed
                        ? (isEn ? 'The terrain itself does not block the path. Buildings or vegetation do.' : 'Sam teren nie przesłania trasy. Ograniczeniem są budynki lub roślinność.')
                        : profile.isTerrainObstructed && profile.isClutterObstructed
                        ? (isEn ? 'Both the terrain and buildings or vegetation block the path.' : 'Trasę przesłania zarówno teren, jak i budynki lub roślinność.')
                        : profile.isTerrainObstructed
                        ? (isEn ? 'The terrain blocks the path.' : 'Trasę przesłania ukształtowanie terenu.')
                        : (isEn ? 'Surface model (NMPT) unavailable: buildings and trees are not included.' : 'Model pokrycia (NMPT) niedostępny: budynki i drzewa nie są uwzględnione.')}
                    </span>
                  </p>
                )}
                {!loading && profile?.isBacklobe && (
                  <p className="tp-verdict-note">
                    <AlertTriangle size={13} />
                    <span>
                      {isEn
                        ? `Receiver behind the antenna (${formatPl(profile.horizontalDeviationDeg, 1)}° off-axis, −${formatPl(profile.antennaLossDb, 1)} dB).`
                        : `Odbiornik za anteną (${formatPl(profile.horizontalDeviationDeg, 1)}° od osi, −${formatPl(profile.antennaLossDb, 1)} dB).`}
                    </span>
                  </p>
                )}
              </div>

              {/* Antenna: one chip per band and sector */}
              <div className="tp-group">
                <div className="tp-group-head">
                  <span className="tp-group-title">{isEn ? 'Antenna' : 'Antena'}</span>
                  {autoSelect ? (
                    <span className="tp-group-tag" title={isEn ? 'The sector facing the receiver was chosen' : 'Wybrano sektor skierowany na odbiornik'}>
                      {isEn ? 'chosen automatically' : 'wybrana automatycznie'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="tp-group-tag is-button"
                      onClick={() => {
                        setAutoSelect(true);
                        setManualSector(null);
                        setSelectedFreq(null);
                      }}
                    >
                      {isEn ? 'choose automatically' : 'wybierz automatycznie'}
                    </button>
                  )}
                </div>
                {(() => {
                  const options = [...sectors]
                    .sort((a, b) => (a.azimuth === closestSectorAzimuth ? -1 : b.azimuth === closestSectorAzimuth ? 1 : a.azimuth - b.azimuth))
                    .flatMap(sec => sec.bands.map(band => ({ ...band, azimuth: sec.azimuth })));
                  const visible = showAllAntennas ? options : options.slice(0, 7);
                  const hidden = options.length - visible.length;
                  return (
                    <div className="tp-ant-chips" role="group" aria-label={isEn ? 'Band and sector' : 'Pasmo i sektor'}>
                      {visible.map(opt => {
                        const isSel = opt.azimuth === activeAntenna.azimuth && opt.bandFreq === activeAntenna.bandFreq;
                        const gen = bandGeneration(opt.bandFreq);
                        return (
                          <button
                            key={`${opt.azimuth}-${opt.bandFreq}`}
                            type="button"
                            className={`tp-ant-chip ${isSel ? 'active' : ''}`}
                            aria-pressed={isSel}
                            onClick={() => {
                              setManualSector(opt.azimuth);
                              setSelectedFreq(opt.bandFreq);
                              setAutoSelect(opt.azimuth === closestSectorAzimuth);
                            }}
                            title={`${opt.bandFreq} MHz · ${isEn ? 'sector' : 'sektor'} ${opt.azimuth}° · ${formatPl(opt.height, 1)} m n.p.t. · tilt ${opt.tilt}°`}
                          >
                            {gen && <span className="tp-ant-gen">{gen}</span>}
                            {opt.bandFreq} · {opt.azimuth}°
                          </button>
                        );
                      })}
                      {hidden > 0 && (
                        <button type="button" className="tp-ant-more" onClick={() => setShowAllAntennas(true)}>
                          +{hidden}
                        </button>
                      )}
                    </div>
                  );
                })()}
                <span className="tp-group-meta">
                  {formatPl(activeAntenna.height, 1)} m n.p.t. · {isEn ? 'tilt' : 'pochylenie'} {activeAntenna.tilt}°
                  {pemReport && !pemReport.antennas?.length ? ` · ${isEn ? 'beam along the path' : 'wiązka w osi trasy'}` : ''}
                </span>
              </div>

              {/* Receiver */}
              <div className="tp-group">
                <div className="tp-group-head">
                  <span className="tp-group-title">{isEn ? 'Receiver' : 'Odbiornik'}</span>
                </div>
                <div className="tp-rx-row">
                  <div className="tp-seg" role="group" aria-label={isEn ? 'Receiver height' : 'Wysokość odbiornika'}>
                    {[1.5, 5, 10].map(h => (
                      <button key={h} type="button" className={rxHeight === h ? 'active' : ''} aria-pressed={rxHeight === h} onClick={() => setRxHeight(h)}>
                        {h === 1.5 ? '1,5 m' : `${h} m`}
                      </button>
                    ))}
                  </div>
                  <label className="tp-rx-input" title={isEn ? 'Custom receiver height (m above ground)' : 'Własna wysokość odbiornika (m n.p.t.)'}>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="100"
                      value={rxHeight}
                      onChange={e => setRxHeight(Math.max(1, Number(e.target.value) || 1))}
                    />
                    <span>m</span>
                  </label>
                </div>
                <div className="tp-rx-point">
                  <span className="tp-coords-text">{targetCoords[0].toFixed(5)}, {targetCoords[1].toFixed(5)}</span>
                  {onPickOnMap && (
                    <button type="button" className="tp-btn-change-pt" onClick={onPickOnMap} title={isEn ? 'Pick another point on the map' : 'Wybierz inny punkt pomiarowy na mapie'}>
                      <Crosshair size={13} />
                      <span>{isEn ? 'Change point' : 'Zmień punkt'}</span>
                    </button>
                  )}
                </div>
              </div>
            </section>

            <main className="tp-main">
              <div className="tp-main-head">
                <div className="tp-legend">
                  <span className="tp-leg-item"><i className="tp-swatch-terrain" /> {isEn ? 'Terrain' : 'Teren'}</span>
                  <span className="tp-leg-item"><i className="tp-swatch-clutter" /> {isEn ? 'Cover' : 'Pokrycie'}</span>
                  <span className="tp-leg-item"><i className="tp-swatch-ray" /> {isEn ? 'Beam' : 'Promień'}</span>
                  <span className="tp-leg-item"><i className="tp-swatch-obstacle" /> {isEn ? 'Obstruction' : 'Przeszkoda'}</span>
                </div>
                {!loading && profile && (
                  <span className="tp-scale-tag">{isEn ? 'vertical' : 'pion'} ×{exaggeration}</span>
                )}
              </div>

            <div className="tp-chart-wrap" ref={containerRef}>
              {loading && (
                <div className="tp-chart-loading">
                  <div className="tp-chart-loading-inner">
                    <span className="tp-loading-ring"><RefreshCw size={20} className="tp-spin" /></span>
                    <span className="tp-chart-loading-title">{isEn ? 'Analysing the LiDAR profile…' : 'Analiza profilu LiDAR…'}</span>
                    <span className="tp-chart-loading-sub">
                      {isEn
                        ? `Ground (NMT 1 m) and trees & buildings (NMPT) from GUGiK · ${formatPl(directDistanceKm, 2)} km, ${formatPl(targetBearing, 1)}°`
                        : `Grunt (NMT 1 m) oraz drzewa i budynki (NMPT) z Geoportalu GUGiK · ${formatPl(directDistanceKm, 2)} km, kierunek ${formatPl(targetBearing, 1)}°`}
                    </span>
                  </div>
                </div>
              )}
              {error && !loading && (
                <div className="tp-chart-error">
                  <div className="tp-error-card">
                    <div className="tp-error-icon-wrap">
                      <AlertTriangle size={22} />
                    </div>
                    <div className="tp-error-content">
                      <h4 className="tp-error-title">Serwer Geoportalu odpowiada zbyt wolno</h4>
                      <p className="tp-error-sub">
                        {error.includes('zbyt długo')
                          ? 'Państwowy serwer NMPT GUGiK nie odpowiedział w wyznaczonym czasie dla wybranego odcinka pomiarowego.'
                          : error}
                      </p>
                      <div className="tp-error-actions">
                        <button
                          type="button"
                          className="tp-btn-retry primary"
                          onClick={() => loadProfile(false)}
                        >
                          <RefreshCw size={13} />
                          <span>Ponów próbę (NMT + NMPT)</span>
                        </button>
                        <button
                          type="button"
                          className="tp-btn-retry secondary"
                          onClick={() => loadProfile(true)}
                        >
                          <Mountain size={13} />
                          <span>Wczytaj tylko grunt (szybki NMT 1 m)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!loading && profile && profile.points.length > 0 && (
                <canvas
                  ref={canvasRef}
                  className="tp-chart-canvas"
                  onMouseMove={handleChartMouseMove}
                  onMouseLeave={() => setHoverIndex(null)}
                  onTouchStart={handleChartTouchMove}
                  onTouchMove={handleChartTouchMove}
                  onTouchEnd={() => setHoverIndex(null)}
                />
              )}

              {/* Precision HUD Tooltip */}
              {hoveredPoint && profile && (
                <div
                  className="tp-chart-tooltip"
                  style={{
                    left: `${Math.min(
                      canvasSize.width - 240,
                      Math.max(
                        12,
                        (canvasSize.width < 480 ? 46 : 56) +
                          (hoveredPoint.distanceKm / Math.max(0.01, profile.distanceKm)) *
                            (canvasSize.width - (canvasSize.width < 480 ? 46 : 56) - 36) +
                          ((canvasSize.width < 480 ? 46 : 56) +
                            (hoveredPoint.distanceKm / Math.max(0.01, profile.distanceKm)) *
                              (canvasSize.width - (canvasSize.width < 480 ? 46 : 56) - 36) >
                          canvasSize.width / 2
                            ? -230
                            : 16)
                      )
                    )}px`,
                    top: '12px',
                  }}
                >
                  <div className="tp-tt-header">
                    <span className="tp-tt-dist">
                      Odcinek <strong>{formatPl(hoveredPoint.distanceKm, 2)} km</strong> od BTS
                    </span>
                    <span className={`tp-tt-pill ${hoveredPoint.isObstacle ? 'err' : 'ok'}`}>
                      {hoveredPoint.isObstacle ? 'Przeszkoda' : 'Czysty tor'}
                    </span>
                  </div>
                  <div className="tp-tt-grid">
                    <div className="tp-tt-col">
                      <span className="tp-tt-k">Rzeźba (NMT):</span>
                      <strong className="tp-tt-v">{formatPl(hoveredPoint.elevation, 1)} m n.p.m.</strong>
                    </div>
                    <div className="tp-tt-col">
                      <span className="tp-tt-k">Korona (NMPT):</span>
                      <strong className="tp-tt-v tp-tt-green">
                        {profile?.nmptAvailable ? `+${formatPl(hoveredPoint.clutter, 1)} m` : '—'}
                      </strong>
                    </div>
                    <div className="tp-tt-col">
                      <span className="tp-tt-k">Wiązka LOS:</span>
                      <strong className="tp-tt-v tp-tt-cyan">{formatPl(hoveredPoint.rayHeight, 1)} m n.p.m.</strong>
                    </div>
                    <div className="tp-tt-col">
                      <span className="tp-tt-k">Prześwit F1:</span>
                      <strong className={`tp-tt-v ${hoveredPoint.isObstacle ? 'tp-tt-red' : 'tp-tt-cyan'}`}>
                        {formatPl(hoveredPoint.rayHeight - hoveredPoint.totalGround, 1)} m
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
              <div className="tp-readouts">
                <span className="tp-readout">
                  <Info size={13} />
                  {isEn ? 'Path loss' : 'Tłumienie trasy'}
                  <b>{!loading && profile ? `${formatPl(profile.pathLossDb, 1)} dB` : <span className="tp-skel" aria-hidden="true" />}</b>
                </span>
                <span className="tp-readout">
                  <Info size={13} />
                  {isEn ? 'Reference field strength (1 kW ERP)' : 'Referencyjne natężenie pola (1 kW ERP)'}
                  <b>{!loading && profile ? `${formatPl(profile.fieldStrengthDbUvM, 1)} dBµV/m` : <span className="tp-skel" aria-hidden="true" />}</b>
                </span>
                <span className="tp-readout">
                  <Info size={13} />
                  {isEn ? 'Beam deviation (est.)' : 'Odchylenie od wiązki (szac.)'}
                  <b>
                    {!loading && profile
                      ? `${isEn ? 'vert.' : 'pion'} ${profile.verticalDeviationDeg !== null && profile.verticalDeviationDeg !== undefined ? `${profile.verticalDeviationDeg >= 0 ? '+' : ''}${formatPl(profile.verticalDeviationDeg, 1)}°` : '—'} · ${isEn ? 'horiz.' : 'poziom'} ${profile.horizontalDeviationDeg !== null && profile.horizontalDeviationDeg !== undefined ? `${formatPl(profile.horizontalDeviationDeg, 1)}°` : '—'}`
                      : <span className="tp-skel" aria-hidden="true" />}
                  </b>
                </span>
                {!loading && profile && (
                  <span className="tp-readout">
                    <Info size={13} />
                    {isEn ? 'Elevation' : 'Wysokość terenu'}
                    <b>{formatPl(profile.txElevation, 0)} → {formatPl(profile.rxElevation, 0)} m n.p.m.</b>
                  </span>
                )}
              </div>

              <div className="tp-sources">
                <span className="tp-src-badge">FSPL + {isEn ? 'diffraction' : 'dyfrakcja'}</span>
                <span>
                  {isEn ? 'Terrain' : 'Teren'}: {loading ? (isEn ? 'loading…' : 'pobieranie…') : profile?.nmptAvailable ? 'LiDAR GUGiK (NMT + NMPT)' : profile?.source || 'LiDAR GUGiK (NMT)'}
                  {!loading && profile ? `, ${isEn ? 'samples every' : 'próbki co'} ${profile.stepM || 15} m` : ''}
                </span>
                {pemReport?.downloadUrl && (
                  <a href={pemReport.downloadUrl} target="_blank" rel="noopener noreferrer" className="tp-pem-link">
                    {isEn ? 'SI2PEM report' : 'Raport SI2PEM'}{pemReport.date ? ` · ${pemReport.date}` : ''} <ArrowUpRight size={11} />
                  </a>
                )}
                {pemReport?.laboratory && <span className="tp-src-lab">{pemReport.laboratory}</span>}
              </div>
            </main>
          </div>
        )
      )}
    </aside>
  );
}
