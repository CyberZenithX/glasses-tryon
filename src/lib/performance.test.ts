import { describe, expect, it } from 'vitest';
import { mean, percentile, PerformanceMonitor, RollingWindow } from './performance.ts';

describe('mean / percentile', () => {
  it('computes the mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBeNaN();
  });

  it('uses nearest-rank percentiles', () => {
    const values = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10]; // unsorted on purpose
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([], 95)).toBeNaN();
  });
});

describe('RollingWindow', () => {
  it('keeps only the newest values', () => {
    const window = new RollingWindow(3);
    [1, 2, 3, 4, 5].forEach((v) => window.push(v));
    expect(window.values().sort()).toEqual([3, 4, 5]);
  });
});

describe('PerformanceMonitor', () => {
  it('derives FPS from frame intervals and latency from arrival -> render', () => {
    const monitor = new PerformanceMonitor();
    for (let i = 0; i < 10; i++) {
      const arrived = i * 33.3;
      monitor.recordFrame({ frameArrivedAt: arrived, arrivalSource: 'capture', inferenceMs: 12, renderedAt: arrived + 20 });
    }
    const stats = monitor.snapshot();
    expect(stats.fps).toBeCloseTo(30, 0);
    expect(stats.inferenceAvgMs).toBe(12);
    expect(stats.latencyAvgMs).toBeCloseTo(20);
  });
});
