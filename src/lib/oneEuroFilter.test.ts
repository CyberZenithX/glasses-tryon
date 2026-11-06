import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OneEuroFilter, PoseFilter, smoothingFactor } from './oneEuroFilter.ts';
import { createPose, rotationDifferenceDeg } from './poseMath.ts';

const FRAME_SEC = 1 / 30;
const settings = { minCutoff: 1, beta: 0, derivativeCutoff: 1 };

describe('smoothingFactor', () => {
  it('is between 0 and 1 and grows with the cutoff', () => {
    const low = smoothingFactor(0.5, FRAME_SEC);
    const high = smoothingFactor(10, FRAME_SEC);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThan(1);
    expect(high).toBeGreaterThan(low);
  });
});

describe('OneEuroFilter', () => {
  it('passes the first sample through and holds a constant signal', () => {
    const filter = new OneEuroFilter(settings);
    expect(filter.filter(5, 0)).toBe(5);
    for (let i = 1; i < 30; i++) expect(filter.filter(5, i * FRAME_SEC)).toBeCloseTo(5);
  });

  it('reduces jitter on a noisy still signal', () => {
    const filter = new OneEuroFilter(settings);
    // Alternating ±1 noise around 0: raw frame-to-frame change is 2 every frame.
    let previous = filter.filter(1, 0);
    let totalChange = 0;
    for (let i = 1; i < 60; i++) {
      const out = filter.filter(i % 2 === 0 ? 1 : -1, i * FRAME_SEC);
      totalChange += Math.abs(out - previous);
      previous = out;
    }
    expect(totalChange / 59).toBeLessThan(0.5); // far less than the raw 2.0
  });

  it('lags less on fast motion when beta is higher', () => {
    const lagAfterRamp = (beta: number) => {
      const filter = new OneEuroFilter({ ...settings, beta });
      let out = 0;
      for (let i = 0; i < 30; i++) out = filter.filter(i * 1.0, i * FRAME_SEC); // 30 units/s ramp
      return 29 - out;
    };
    expect(lagAfterRamp(1)).toBeLessThan(lagAfterRamp(0));
  });

  it('starts fresh after reset', () => {
    const filter = new OneEuroFilter(settings);
    filter.filter(0, 0);
    filter.filter(0, FRAME_SEC);
    filter.reset();
    expect(filter.filter(100, 2 * FRAME_SEC)).toBe(100);
  });
});

describe('PoseFilter', () => {
  it('handles quaternion sign flips without spinning', () => {
    const filter = new PoseFilter(settings, settings);
    const raw = createPose();
    const out = createPose();
    raw.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
    filter.filter(raw, 0, out);
    // Same rotation, opposite sign.
    raw.quaternion.set(-raw.quaternion.x, -raw.quaternion.y, -raw.quaternion.z, -raw.quaternion.w);
    filter.filter(raw, FRAME_SEC, out);
    expect(rotationDifferenceDeg(out, raw)).toBeLessThan(0.01);
  });

  it('smooths position towards the raw value', () => {
    const filter = new PoseFilter(settings, settings);
    const raw = createPose();
    const out = createPose();
    filter.filter(raw, 0, out);
    raw.position.set(1, 0, 0);
    filter.filter(raw, FRAME_SEC, out);
    expect(out.position.x).toBeGreaterThan(0);
    expect(out.position.x).toBeLessThan(1);
  });
});
