import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { averageColour, intensityForBrightness, lightColourForRoom } from './lighting.ts';
import { CONFIG } from './config.ts';

describe('averageColour', () => {
  it('averages RGBA pixels into 0..1 channels and a brightness', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]); // white + black
    const result = averageColour(pixels);
    expect(result.r).toBeCloseTo(0.5);
    expect(result.brightness).toBeCloseTo(0.5);
  });
});

describe('intensityForBrightness', () => {
  it('is 1 at the reference brightness', () => {
    expect(intensityForBrightness(CONFIG.lighting.referenceBrightness)).toBeCloseTo(1);
  });
  it('is dimmer in a dark room and brighter in a bright one, within limits', () => {
    const [min, max] = CONFIG.lighting.intensityRange;
    expect(intensityForBrightness(0.2)).toBeLessThan(1);
    expect(intensityForBrightness(0.7)).toBeGreaterThan(1);
    expect(intensityForBrightness(0)).toBe(min);
    expect(intensityForBrightness(1)).toBeLessThanOrEqual(max);
  });
});

describe('lightColourForRoom', () => {
  it('stays white in a grey room and warms up in an orange room', () => {
    const colour = new THREE.Color();
    lightColourForRoom(0.3, 0.3, 0.3, colour);
    expect([colour.r, colour.g, colour.b]).toEqual([1, 1, 1]);
    lightColourForRoom(0.8, 0.5, 0.2, colour);
    expect(colour.r).toBe(1);
    expect(colour.b).toBeLessThan(colour.g);
  });
});
