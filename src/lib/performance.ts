// Timing for the live stats panel and the tests. The per-frame loop reports, for
// each camera frame: when it arrived, how long face tracking took, and when the
// frame was rendered. This module keeps rolling windows of those numbers and
// turns them into FPS, average and 95th-percentile figures.
import { CONFIG } from './config.ts';

/** Average of a list of numbers (NaN for an empty list). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/**
 * p-th percentile (0..100) using the "nearest rank" method: the smallest value
 * that at least p% of the values are less than or equal to. p95 = "95% of frames
 * were at least this good", which hides rare one-off spikes less than a max would.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? NaN;
}

/** Fixed-size buffer of the most recent N numbers (oldest are overwritten). */
export class RollingWindow {
  private readonly buffer: Float64Array;
  private next = 0;
  private count = 0;

  constructor(capacity: number) {
    this.buffer = new Float64Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.next] = value;
    this.next = (this.next + 1) % this.buffer.length;
    this.count = Math.min(this.count + 1, this.buffer.length);
  }

  /** Copy of the stored values (only call a few times per second, not per frame). */
  values(): number[] {
    return Array.from(this.buffer.subarray(0, this.count));
  }

  clear(): void {
    this.next = 0;
    this.count = 0;
  }
}

export interface FrameTiming {
  /** When the camera frame became available (ms, performance.now() clock). */
  frameArrivedAt: number;
  /** Which clock frameArrivedAt came from (see VideoFrameClock). */
  arrivalSource: VideoFrameClock['source'];
  /** How long MediaPipe took on this frame (ms). */
  inferenceMs: number;
  /** When the frame's render was submitted to the GPU (ms). */
  renderedAt: number;
}

export interface StatsSnapshot {
  fps: number;
  inferenceAvgMs: number;
  inferenceP95Ms: number;
  latencyAvgMs: number;
  latencyP95Ms: number;
  latencySource: VideoFrameClock['source'];
}

export class PerformanceMonitor {
  private readonly frameIntervalsMs = new RollingWindow(CONFIG.stats.windowFrames);
  private readonly inferenceMs = new RollingWindow(CONFIG.stats.windowFrames);
  private readonly latencyMs = new RollingWindow(CONFIG.stats.windowFrames);
  private lastRenderedAt: number | null = null;
  private latencySource: VideoFrameClock['source'] = 'loop';

  /** Called by the per-frame loop once per processed camera frame. */
  recordFrame(timing: FrameTiming): void {
    // FPS counts camera frames that went through the whole pipeline, not screen
    // refreshes: re-drawing the same camera frame at 60 Hz would not be "60 FPS".
    if (this.lastRenderedAt !== null) this.frameIntervalsMs.push(timing.renderedAt - this.lastRenderedAt);
    this.lastRenderedAt = timing.renderedAt;
    this.latencySource = timing.arrivalSource;
    this.inferenceMs.push(timing.inferenceMs);
    this.latencyMs.push(timing.renderedAt - timing.frameArrivedAt);
  }

  snapshot(): StatsSnapshot {
    const MS_PER_SECOND = 1000;
    const intervals = this.frameIntervalsMs.values();
    const inference = this.inferenceMs.values();
    const latency = this.latencyMs.values();
    return {
      fps: MS_PER_SECOND / mean(intervals),
      inferenceAvgMs: mean(inference),
      inferenceP95Ms: percentile(inference, 95),
      latencyAvgMs: mean(latency),
      latencyP95Ms: percentile(latency, 95),
      latencySource: this.latencySource,
    };
  }
}

/**
 * Tracks when each camera frame arrived, using requestVideoFrameCallback where the
 * browser supports it (Chrome, Edge, Safari 15.4+). Where the browser reports the
 * camera's own capture time we use it, so latency covers capture -> screen; otherwise
 * the time the frame was handed to the page. Without the API, the per-frame loop
 * falls back to the moment it noticed the new frame (slightly optimistic).
 */
export class VideoFrameClock {
  /** performance.now() time the newest frame arrived, or null if unknown. */
  latestArrivalMs: number | null = null;
  /** Which clock the arrival time comes from (shown in the stats panel). */
  source: 'capture' | 'presentation' | 'loop' = 'loop';
  private callbackId: number | null = null;
  private readonly video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    if ('requestVideoFrameCallback' in video) this.callbackId = video.requestVideoFrameCallback(this.onFrame);
  }

  private onFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
    if (metadata.captureTime !== undefined) {
      this.latestArrivalMs = metadata.captureTime;
      this.source = 'capture';
    } else {
      this.latestArrivalMs = metadata.presentationTime;
      this.source = 'presentation';
    }
    this.callbackId = this.video.requestVideoFrameCallback(this.onFrame);
  };

  stop(): void {
    if (this.callbackId !== null) this.video.cancelVideoFrameCallback(this.callbackId);
    this.callbackId = null;
  }
}
