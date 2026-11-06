import { describe, expect, it } from 'vitest';
import { faceCrop, toggleFrame } from './capture.ts';
import { CONFIG } from './config.ts';

const box = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];

describe('faceCrop', () => {
  it('keeps the photo aspect ratio in pixels', () => {
    const crop = faceCrop(box(0.4, 0.3, 0.6, 0.6), 1280, 720);
    expect((crop.width * 1280) / (crop.height * 720)).toBeCloseTo(CONFIG.compare.photoAspect, 5);
  });

  it('stays inside the image, even for a face at the edge', () => {
    const crop = faceCrop(box(0.0, 0.0, 0.15, 0.3), 1280, 720);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('mirrors: a face on the left of the camera frame is on the right of the selfie view', () => {
    const crop = faceCrop(box(0.1, 0.4, 0.2, 0.55), 1280, 720);
    expect(crop.x + crop.width / 2).toBeGreaterThan(0.5);
  });

  it('never exceeds the image when the face is huge', () => {
    const crop = faceCrop(box(0, 0, 1, 1), 720, 1280);
    expect(crop.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(crop.height).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('toggleFrame', () => {
  it('adds to an empty slot and makes it active', () => {
    expect(toggleFrame(['a'], 0, 'b', 3)).toEqual({ slots: ['a', 'b'], activeIndex: 1 });
  });

  it('removes a frame that is already chosen', () => {
    expect(toggleFrame(['a', 'b', 'c'], 2, 'c', 3)).toEqual({ slots: ['a', 'b'], activeIndex: 1 });
  });

  it('replaces the active slot when all slots are full', () => {
    expect(toggleFrame(['a', 'b', 'c'], 1, 'd', 3)).toEqual({ slots: ['a', 'd', 'c'], activeIndex: 1 });
  });
});
