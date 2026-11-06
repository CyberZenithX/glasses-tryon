// The two 10-second tests (Tier 3) and their maths. During a test the per-frame
// loop writes one row per camera frame into a TestRecorder (raw pose, smoothed
// pose, timings); when it ends, analyseTest turns the rows into the scores:
//   jitter = how far the glasses move between frames while the head is still
//   lag    = how far the smoothed pose trails the raw pose while the head turns
// Everything except the recorder is a pure function (arrays in, numbers out).
import * as THREE from 'three';
import { CONFIG } from './config.ts';
import { mean, percentile } from './performance.ts';
import type { Pose } from './poseMath.ts';

export type TestKind = 'hold-still' | 'head-turn';

export const TEST_LABELS: Record<TestKind, { name: string; instruction: string }> = {
  'hold-still': { name: 'Hold still test', instruction: 'Keep your head still and look at the camera' },
  'head-turn': { name: 'Head turn test', instruction: 'Turn your head slowly left and right' },
};

/** Position in cm and rotation as a quaternion (x, y, z, w), both in camera space. */
export interface PoseSample {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

/** One recorded camera frame. */
export interface TestFrame {
  frame: number; // 1, 2, 3... in recording order
  timeMs: number; // when the frame was rendered, ms since the test started
  faceFound: boolean; // false: no face on this frame, the poses are not meaningful
  raw: PoseSample; // straight from MediaPipe
  smoothed: PoseSample; // after the One Euro filter
  inferenceMs: number;
  latencyMs: number;
}

export interface Stats {
  avg: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

export function summarize(values: readonly number[]): Stats {
  return {
    avg: mean(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    min: values.length ? Math.min(...values) : NaN,
    max: values.length ? Math.max(...values) : NaN,
  };
}

const MM_PER_CM = 10;
const scratchA = new THREE.Quaternion();
const scratchB = new THREE.Quaternion();

/** Distance between two positions, in millimetres. */
export function positionGapMm(a: PoseSample, b: PoseSample): number {
  const [ax, ay, az] = a.position;
  const [bx, by, bz] = b.position;
  return Math.hypot(ax - bx, ay - by, az - bz) * MM_PER_CM;
}

/** Smallest rotation that turns one orientation into the other, in degrees. */
export function rotationGapDeg(a: PoseSample, b: PoseSample): number {
  scratchA.fromArray(a.quaternion);
  scratchB.fromArray(b.quaternion);
  return THREE.MathUtils.radToDeg(scratchA.angleTo(scratchB));
}

/**
 * Frame-to-frame movement (the jitter measure): for each pair of consecutive
 * frames that both have a face, how far the pose moved. A frame without a face
 * breaks the chain, so a lost-and-found face never counts as a big jump.
 */
export function frameToFrameMotion(frames: readonly TestFrame[], which: 'raw' | 'smoothed') {
  const positionMm: number[] = [];
  const rotationDeg: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1];
    const current = frames[i];
    if (!previous?.faceFound || !current?.faceFound) continue;
    positionMm.push(positionGapMm(previous[which], current[which]));
    rotationDeg.push(rotationGapDeg(previous[which], current[which]));
  }
  return { positionMm, rotationDeg };
}

/**
 * Raw vs smoothed on the same frame (the lag measure). Both poses come from the
 * same camera frame at the same moment, so any gap is purely the filter's delay.
 */
export function rawSmoothedGap(frames: readonly TestFrame[]) {
  const positionMm: number[] = [];
  const rotationDeg: number[] = [];
  for (const frame of frames) {
    if (!frame.faceFound) continue;
    positionMm.push(positionGapMm(frame.raw, frame.smoothed));
    rotationDeg.push(rotationGapDeg(frame.raw, frame.smoothed));
  }
  return { positionMm, rotationDeg };
}

/** Time between consecutive rendered frames (ms). */
export function frameIntervals(frames: readonly TestFrame[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1];
    const current = frames[i];
    if (previous && current) intervals.push(current.timeMs - previous.timeMs);
  }
  return intervals;
}

export interface TestResult {
  kind: TestKind;
  durationSec: number;
  frameCount: number;
  faceFrameCount: number;
  jitter: {
    raw: { positionMm: Stats; rotationDeg: Stats };
    smoothed: { positionMm: Stats; rotationDeg: Stats };
  };
  lag: { positionMm: Stats; rotationDeg: Stats };
  /**
   * Frames per second. avg = frames / time. p50 / p95 / min come from the frame
   * intervals, so "p95" means 95% of frames arrived at least this fast (the slow
   * tail, like latency p95), and min is the single slowest frame.
   */
  fps: { avg: number; p50: number; p95: number; min: number };
  latencyMs: Stats;
  inferenceMs: Stats;
}

export function analyseTest(kind: TestKind, frames: readonly TestFrame[]): TestResult {
  const MS_PER_SECOND = 1000;
  const raw = frameToFrameMotion(frames, 'raw');
  const smoothed = frameToFrameMotion(frames, 'smoothed');
  const gap = rawSmoothedGap(frames);
  const intervals = summarize(frameIntervals(frames));
  const first = frames[0];
  const last = frames[frames.length - 1];
  const spanMs = first && last ? last.timeMs - first.timeMs : 0;
  return {
    kind,
    durationSec: spanMs / MS_PER_SECOND,
    frameCount: frames.length,
    faceFrameCount: frames.filter((frame) => frame.faceFound).length,
    jitter: {
      raw: { positionMm: summarize(raw.positionMm), rotationDeg: summarize(raw.rotationDeg) },
      smoothed: { positionMm: summarize(smoothed.positionMm), rotationDeg: summarize(smoothed.rotationDeg) },
    },
    lag: { positionMm: summarize(gap.positionMm), rotationDeg: summarize(gap.rotationDeg) },
    fps: {
      // Intervals between N frames: N - 1 of them over the span.
      avg: spanMs > 0 ? ((frames.length - 1) * MS_PER_SECOND) / spanMs : NaN,
      p50: MS_PER_SECOND / intervals.p50,
      p95: MS_PER_SECOND / intervals.p95,
      min: MS_PER_SECOND / intervals.max,
    },
    latencyMs: summarize(frames.map((frame) => frame.latencyMs)),
    inferenceMs: summarize(frames.map((frame) => frame.inferenceMs)),
  };
}

/** Test conditions written at the top of the CSV (the device is not detectable: fill it in by hand). */
export interface TestConditions {
  date: string;
  userAgent: string;
  videoSize: string;
  trackerDelegate: string;
  smoothingShown: boolean;
  testSwitches: string;
}

const csvNumber = (value: number, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '');

/** CSV: a summary block (lines starting with #), then one row per frame. */
export function testCsv(result: TestResult, frames: readonly TestFrame[], conditions: TestConditions): string {
  const stat = (label: string, stats: Stats) =>
    `# ${label},avg ${csvNumber(stats.avg)},p50 ${csvNumber(stats.p50)},p95 ${csvNumber(stats.p95)},min ${csvNumber(stats.min)},max ${csvNumber(stats.max)}`;
  const { position, rotation } = CONFIG.smoothing;
  const summary = [
    `# ${TEST_LABELS[result.kind].name}`,
    `# date,${conditions.date}`,
    `# device,(fill in)`,
    `# lighting,(fill in)`,
    `# browser,"${conditions.userAgent.replace(/"/g, "'")}"`,
    `# video,${conditions.videoSize}`,
    `# tracker,${conditions.trackerDelegate}`,
    `# glasses shown,${conditions.smoothingShown ? 'smoothed' : 'raw'}`,
    `# smoothing,position minCutoff ${position.minCutoff} beta ${position.beta},rotation minCutoff ${rotation.minCutoff} beta ${rotation.beta}`,
    `# test switches,${conditions.testSwitches || 'none'}`,
    `# duration s,${csvNumber(result.durationSec, 2)}`,
    `# frames,${result.frameCount},with face,${result.faceFrameCount}`,
    stat('jitter raw mm', result.jitter.raw.positionMm),
    stat('jitter smoothed mm', result.jitter.smoothed.positionMm),
    stat('jitter raw deg', result.jitter.raw.rotationDeg),
    stat('jitter smoothed deg', result.jitter.smoothed.rotationDeg),
    stat('lag mm', result.lag.positionMm),
    stat('lag deg', result.lag.rotationDeg),
    `# fps,avg ${csvNumber(result.fps.avg, 1)},p50 ${csvNumber(result.fps.p50, 1)},p95 ${csvNumber(result.fps.p95, 1)},min ${csvNumber(result.fps.min, 1)}`,
    stat('latency ms', result.latencyMs),
    stat('inference ms', result.inferenceMs),
  ];
  const header = [
    'frame',
    'time_ms',
    'face',
    'raw_x_cm',
    'raw_y_cm',
    'raw_z_cm',
    'raw_qx',
    'raw_qy',
    'raw_qz',
    'raw_qw',
    'smoothed_x_cm',
    'smoothed_y_cm',
    'smoothed_z_cm',
    'smoothed_qx',
    'smoothed_qy',
    'smoothed_qz',
    'smoothed_qw',
    'inference_ms',
    'latency_ms',
    'lag_mm',
    'lag_deg',
  ].join(',');
  const rows = frames.map((frame) => {
    const pose = (sample: PoseSample) => [...sample.position, ...sample.quaternion].map((v) => csvNumber(v, 5));
    const lag = frame.faceFound
      ? [csvNumber(positionGapMm(frame.raw, frame.smoothed)), csvNumber(rotationGapDeg(frame.raw, frame.smoothed))]
      : ['', ''];
    return [
      frame.frame,
      csvNumber(frame.timeMs, 2),
      frame.faceFound ? 1 : 0,
      ...pose(frame.raw),
      ...pose(frame.smoothed),
      csvNumber(frame.inferenceMs, 2),
      csvNumber(frame.latencyMs, 2),
      ...lag,
    ].join(',');
  });
  return [...summary, header, ...rows].join('\n') + '\n';
}

// Values stored per frame in the recorder (see record()).
const COLUMNS = 18; // time, face, raw pose (7), smoothed pose (7), inference, latency

/**
 * Records test frames into one preallocated typed array, so the per-frame loop
 * allocates nothing while a test runs. The UI reads the result after it ends.
 */
export class TestRecorder {
  kind: TestKind | null = null;
  private startedAt = 0;
  private count = 0;
  private finished = false;
  private readonly rows: Float64Array;
  private readonly capacity: number;

  constructor() {
    const { durationSec, maxRecordedFps } = CONFIG.stabilityTest;
    this.capacity = Math.ceil(durationSec * maxRecordedFps);
    this.rows = new Float64Array(this.capacity * COLUMNS);
  }

  start(kind: TestKind, nowMs: number): void {
    this.kind = kind;
    this.startedAt = nowMs;
    this.count = 0;
    this.finished = false;
  }

  cancel(): void {
    this.kind = null;
    this.finished = false;
  }

  /** True while frames should be recorded. */
  get running(): boolean {
    return this.kind !== null && !this.finished;
  }

  get done(): boolean {
    return this.finished;
  }

  /** 0..1 of the test duration (for a progress bar). */
  progress(nowMs: number): number {
    if (this.finished) return 1;
    if (!this.running) return 0;
    return Math.min((nowMs - this.startedAt) / (CONFIG.stabilityTest.durationSec * 1000), 1);
  }

  /** Called by the per-frame loop for every processed camera frame while running. */
  record(
    renderedAtMs: number,
    faceFound: boolean,
    raw: Pose,
    smoothed: Pose,
    inferenceMs: number,
    latencyMs: number,
  ): void {
    if (!this.running) return;
    if (renderedAtMs - this.startedAt >= CONFIG.stabilityTest.durationSec * 1000 || this.count >= this.capacity) {
      this.finished = true;
      return;
    }
    let i = this.count * COLUMNS;
    this.rows[i++] = renderedAtMs - this.startedAt;
    this.rows[i++] = faceFound ? 1 : 0;
    i = this.writePose(i, raw);
    i = this.writePose(i, smoothed);
    this.rows[i++] = inferenceMs;
    this.rows[i] = latencyMs;
    this.count++;
  }

  private writePose(start: number, pose: Pose): number {
    let i = start;
    this.rows[i++] = pose.position.x;
    this.rows[i++] = pose.position.y;
    this.rows[i++] = pose.position.z;
    this.rows[i++] = pose.quaternion.x;
    this.rows[i++] = pose.quaternion.y;
    this.rows[i++] = pose.quaternion.z;
    this.rows[i++] = pose.quaternion.w;
    return i;
  }

  /** The recorded frames as plain objects (called once, after the test). */
  frames(): TestFrame[] {
    const frames: TestFrame[] = [];
    for (let row = 0; row < this.count; row++) {
      const r = this.rows.subarray(row * COLUMNS, (row + 1) * COLUMNS);
      const sample = (offset: number): PoseSample => ({
        position: [r[offset] ?? 0, r[offset + 1] ?? 0, r[offset + 2] ?? 0],
        quaternion: [r[offset + 3] ?? 0, r[offset + 4] ?? 0, r[offset + 5] ?? 0, r[offset + 6] ?? 1],
      });
      frames.push({
        frame: row + 1,
        timeMs: r[0] ?? 0,
        faceFound: r[1] === 1,
        raw: sample(2),
        smoothed: sample(9),
        inferenceMs: r[16] ?? 0,
        latencyMs: r[17] ?? 0,
      });
    }
    return frames;
  }
}
