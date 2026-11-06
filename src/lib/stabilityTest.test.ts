import { describe, expect, it } from 'vitest';
import {
  analyseTest,
  frameIntervals,
  frameToFrameMotion,
  rawSmoothedGap,
  rotationGapDeg,
  summarize,
  testCsv,
  type PoseSample,
  type TestFrame,
} from './stabilityTest.ts';

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];
const at = (x: number, quaternion = IDENTITY): PoseSample => ({ position: [x, 0, 50], quaternion });

function frame(index: number, rawX: number, smoothedX: number, faceFound = true): TestFrame {
  return { frame: index + 1, timeMs: index * 40, faceFound, raw: at(rawX), smoothed: at(smoothedX), inferenceMs: 10, latencyMs: 30 + index };
}

describe('summarize', () => {
  it('gives avg, median, p95, min and max', () => {
    const stats = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stats.avg).toBe(5.5);
    expect(stats.p50).toBe(5);
    expect(stats.p95).toBe(10);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(10);
  });
});

describe('frameToFrameMotion (jitter)', () => {
  it('measures movement between consecutive frames in mm', () => {
    // Raw shakes 0.1 cm back and forth; smoothed stays put.
    const frames = [frame(0, 0, 0), frame(1, 0.1, 0), frame(2, 0, 0)];
    expect(frameToFrameMotion(frames, 'raw').positionMm).toEqual([1, 1].map((v) => expect.closeTo(v, 9)));
    expect(frameToFrameMotion(frames, 'smoothed').positionMm).toEqual([0, 0]);
  });

  it('skips pairs that include a frame without a face', () => {
    const frames = [frame(0, 0, 0), frame(1, 5, 5, false), frame(2, 0, 0)];
    expect(frameToFrameMotion(frames, 'raw').positionMm).toEqual([]);
  });
});

describe('rawSmoothedGap (lag)', () => {
  it('measures raw vs smoothed on the same frame', () => {
    expect(rawSmoothedGap([frame(0, 1, 0.5)]).positionMm[0]).toBeCloseTo(5);
  });

  it('measures rotation differences in degrees', () => {
    const half = Math.SQRT1_2;
    expect(rotationGapDeg(at(0), at(0, [0, half, 0, half]))).toBeCloseTo(90);
  });
});

describe('analyseTest', () => {
  it('computes FPS from frame times', () => {
    const frames = Array.from({ length: 26 }, (_, i) => frame(i, 0, 0));
    expect(frameIntervals(frames)).toHaveLength(25);
    const result = analyseTest('hold-still', frames);
    expect(result.fps.avg).toBeCloseTo(25); // one frame every 40 ms
    expect(result.durationSec).toBeCloseTo(1);
    expect(result.faceFrameCount).toBe(26);
  });

  it('writes a CSV with a summary and one row per frame', () => {
    const frames = [frame(0, 0, 0), frame(1, 0.1, 0.05)];
    const csv = testCsv(analyseTest('head-turn', frames), frames, {
      date: '2026-11-06',
      userAgent: 'test',
      videoSize: '1280x720',
      trackerDelegate: 'GPU',
      smoothingShown: true,
      testSwitches: '',
    });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('# Head turn test');
    const header = lines.findIndex((line) => line.startsWith('frame,'));
    expect(lines.length - header - 1).toBe(2);
  });
});
