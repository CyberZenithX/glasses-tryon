// Small panel with live performance figures: FPS, face-tracking (inference) time
// and frame latency, plus the Hold-still / Head-turn test buttons. It reads the
// PerformanceMonitor a few times per second, so the per-frame loop never waits on React.
import { useEffect, useState } from 'react';
import { CONFIG } from '../lib/config.ts';
import { TEST_SWITCHES } from '../lib/testSwitches.ts';
import type { PerformanceMonitor, StatsSnapshot } from '../lib/performance.ts';
import type { TestRecorder } from '../lib/stabilityTest.ts';
import StabilityTestPanel from './StabilityTestPanel.tsx';

// Targets from the brief, used to colour the numbers green/amber.
const TARGET_MIN_FPS = 24;
const TARGET_MAX_LATENCY_MS = 100;
const MS_PER_SECOND = 1000;

interface StatsOverlayProps {
  monitor: PerformanceMonitor;
  recorder: TestRecorder;
  delegate: 'GPU' | 'CPU';
  videoWidth: number;
  videoHeight: number;
  smoothingEnabled: boolean;
  onSmoothingChange: (enabled: boolean) => void;
}

// Rendering test switches that are on, so a screenshot of the panel shows them.
const ACTIVE_RENDER_SWITCHES = [
  TEST_SWITCHES.singlePixelRatio && 'dpr 1',
  TEST_SWITCHES.noShadows && 'no shadows',
  TEST_SWITCHES.noTransmission && 'no transmission',
].filter(Boolean);

const format = (value: number, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : '–');

export default function StatsOverlay(props: StatsOverlayProps) {
  const { monitor, recorder, delegate, videoWidth, videoHeight, smoothingEnabled, onSmoothingChange } = props;
  const [stats, setStats] = useState<StatsSnapshot>(() => monitor.snapshot());

  useEffect(() => {
    const id = window.setInterval(() => setStats(monitor.snapshot()), MS_PER_SECOND / CONFIG.stats.panelRefreshHz);
    return () => window.clearInterval(id);
  }, [monitor]);

  const fpsOk = stats.fps >= TARGET_MIN_FPS;
  const latencyOk = stats.latencyP95Ms < TARGET_MAX_LATENCY_MS;

  return (
    <section className="stats-panel" aria-label="Performance stats">
      <dl>
        <dt>FPS</dt>
        <dd className={fpsOk ? 'ok' : 'warn'}>{format(stats.fps, 1)}</dd>
        <dt>Inference</dt>
        <dd>
          {format(stats.inferenceAvgMs, 1)} ms <span className="muted">p95 {format(stats.inferenceP95Ms, 1)}</span>
        </dd>
        <dt>Latency</dt>
        <dd className={latencyOk ? 'ok' : 'warn'}>
          {format(stats.latencyAvgMs, 1)} ms <span className="muted">p95 {format(stats.latencyP95Ms, 1)}</span>
        </dd>
      </dl>
      {/* Turning smoothing off shows the raw MediaPipe pose: useful to see the jitter it removes. */}
      <label className="stats-toggle">
        <input type="checkbox" checked={smoothingEnabled} onChange={(e) => onSmoothingChange(e.target.checked)} />
        Smoothing (One Euro)
      </label>
      <p className="muted stats-footnote">
        {videoWidth}×{videoHeight} · {delegate} · latency from {stats.latencySource}
        {ACTIVE_RENDER_SWITCHES.length > 0 && ` · ${ACTIVE_RENDER_SWITCHES.join(' · ')}`}
      </p>
      <StabilityTestPanel
        recorder={recorder}
        delegate={delegate}
        videoWidth={videoWidth}
        videoHeight={videoHeight}
        smoothingEnabled={smoothingEnabled}
      />
    </section>
  );
}
