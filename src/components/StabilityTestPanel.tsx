// The two test buttons in the stats panel (Hold still / Head turn). Starting a
// test arms the TestRecorder; the per-frame loop fills it for 10 s; this panel
// then shows the scores (stabilityTest.ts does the maths) and offers a CSV.
import { useEffect, useState } from 'react';
import { CONFIG } from '../lib/config.ts';
import { downloadBlob } from '../lib/download.ts';
import {
  analyseTest,
  TEST_LABELS,
  testCsv,
  type Stats,
  type TestFrame,
  type TestKind,
  type TestRecorder,
  type TestResult,
} from '../lib/stabilityTest.ts';
import { TEST_SWITCHES } from '../lib/testSwitches.ts';

interface StabilityTestPanelProps {
  recorder: TestRecorder;
  delegate: 'GPU' | 'CPU';
  videoWidth: number;
  videoHeight: number;
  smoothingEnabled: boolean;
}

// How often the progress bar updates while a test runs.
const PROGRESS_REFRESH_MS = 100;

type PanelState =
  | { phase: 'idle' }
  | { phase: 'running'; kind: TestKind; progress: number }
  | { phase: 'done'; result: TestResult; frames: TestFrame[]; finishedAt: Date };

const fmt = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '–');

export default function StabilityTestPanel(props: StabilityTestPanelProps) {
  const { recorder, delegate, videoWidth, videoHeight, smoothingEnabled } = props;
  const [state, setState] = useState<PanelState>({ phase: 'idle' });

  // While running, poll the recorder (the loop never waits on React).
  const runningKind = state.phase === 'running' ? state.kind : null;
  useEffect(() => {
    if (!runningKind) return;
    const id = window.setInterval(() => {
      if (recorder.done) {
        // Stop polling right away: on a slow device queued ticks can run back to
        // back, and a late one would overwrite the results with "running".
        window.clearInterval(id);
        const frames = recorder.frames();
        recorder.cancel();
        setState({ phase: 'done', result: analyseTest(runningKind, frames), frames, finishedAt: new Date() });
      } else if (recorder.running) {
        setState({ phase: 'running', kind: runningKind, progress: recorder.progress(performance.now()) });
      }
    }, PROGRESS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [runningKind, recorder]);

  // Leaving the panel mid-test stops the recording.
  useEffect(() => () => recorder.cancel(), [recorder]);

  const start = (kind: TestKind) => {
    recorder.start(kind, performance.now());
    setState({ phase: 'running', kind, progress: 0 });
  };

  const cancel = () => {
    recorder.cancel();
    setState({ phase: 'idle' });
  };

  const downloadCsv = () => {
    if (state.phase !== 'done') return;
    const switches = Object.entries(TEST_SWITCHES)
      .filter(([, on]) => on)
      .map(([name]) => name)
      .join(' ');
    const csv = testCsv(state.result, state.frames, {
      date: state.finishedAt.toISOString(),
      userAgent: navigator.userAgent,
      videoSize: `${videoWidth}x${videoHeight}`,
      trackerDelegate: delegate,
      smoothingShown: smoothingEnabled,
      testSwitches: switches,
    });
    const stamp = state.finishedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${state.result.kind}-${stamp}.csv`);
  };

  if (state.phase === 'running') {
    const secondsLeft = Math.ceil(CONFIG.stabilityTest.durationSec * (1 - state.progress));
    return (
      <div className="test-panel" aria-live="polite">
        <p className="test-title">
          {TEST_LABELS[state.kind].name} · {secondsLeft} s
        </p>
        <p className="test-instruction">{TEST_LABELS[state.kind].instruction}</p>
        <div className="test-progress" role="progressbar" aria-valuenow={Math.round(state.progress * 100)}>
          <span style={{ width: `${state.progress * 100}%` }} />
        </div>
        <button type="button" className="test-button" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (state.phase === 'done') {
    const { result } = state;
    const row = (label: string, stats: Stats, unit: string) => (
      <tr>
        <th scope="row">{label}</th>
        <td>{fmt(stats.avg)}</td>
        <td>{fmt(stats.p95)}</td>
        <td className="muted">{unit}</td>
      </tr>
    );
    return (
      <div className="test-panel">
        <p className="test-title">{TEST_LABELS[result.kind].name}</p>
        <p className="muted test-meta">
          {fmt(result.durationSec, 1)} s · {result.frameCount} frames · {result.faceFrameCount} with a face
        </p>
        <table className="test-table">
          <thead>
            <tr>
              <th />
              <th>avg</th>
              <th>p95</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {/* Hold still: jitter is the headline; Head turn: lag is. Both are always shown. */}
            {row('Jitter raw', result.jitter.raw.positionMm, 'mm')}
            {row('Jitter smoothed', result.jitter.smoothed.positionMm, 'mm')}
            {row('Jitter raw', result.jitter.raw.rotationDeg, '°')}
            {row('Jitter smoothed', result.jitter.smoothed.rotationDeg, '°')}
            {row('Lag', result.lag.positionMm, 'mm')}
            {row('Lag', result.lag.rotationDeg, '°')}
            {row('Latency', result.latencyMs, 'ms')}
            {row('Inference', result.inferenceMs, 'ms')}
          </tbody>
        </table>
        <p className="muted test-meta">
          FPS avg {fmt(result.fps.avg, 1)} · p50 {fmt(result.fps.p50, 1)} · p95 {fmt(result.fps.p95, 1)} · min{' '}
          {fmt(result.fps.min, 1)} · latency p50 {fmt(result.latencyMs.p50, 1)} · min {fmt(result.latencyMs.min, 1)}{' '}
          ms
        </p>
        <div className="test-actions">
          <button type="button" className="test-button test-button-primary" onClick={downloadCsv}>
            Download CSV
          </button>
          <button type="button" className="test-button" onClick={() => setState({ phase: 'idle' })}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="test-actions">
      <button type="button" className="test-button" onClick={() => start('hold-still')}>
        Hold still test
      </button>
      <button type="button" className="test-button" onClick={() => start('head-turn')}>
        Head turn test
      </button>
    </div>
  );
}
