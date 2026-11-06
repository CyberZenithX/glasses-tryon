// Adaptive lighting: a few times per second, shrink the video frame to 16x9 pixels,
// average them, and turn that into a light strength and colour for the 3D scene.
// The per-frame loop calls sampleRoomLight() on a timer and eases the scene's
// lights towards the result, so glasses match bright, dim, warm or cool rooms.
import * as THREE from 'three';
import { CONFIG } from './config.ts';

export interface RoomLight {
  /** Multiplier for all light strengths (1 = base strength). */
  intensity: number;
  /** Light colour (white, gently tinted towards the room's average colour). */
  colour: THREE.Color;
}

// sRGB weights for perceived brightness (Rec. 709): green looks brightest, blue darkest.
const LUMA_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 };
const MAX_CHANNEL = 255;

/** Average colour (0..1 per channel) and brightness of RGBA pixel data. */
export function averageColour(pixels: Uint8ClampedArray): { r: number; g: number; b: number; brightness: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixelCount = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    r += pixels[i] ?? 0;
    g += pixels[i + 1] ?? 0;
    b += pixels[i + 2] ?? 0;
  }
  const scale = 1 / (pixelCount * MAX_CHANNEL);
  r *= scale;
  g *= scale;
  b *= scale;
  return { r, g, b, brightness: LUMA_WEIGHTS.r * r + LUMA_WEIGHTS.g * g + LUMA_WEIGHTS.b * b };
}

/**
 * Brightness (0..1) -> light multiplier. Relative to a reference brightness, raised
 * to a sensitivity power (0 = constant, 1 = proportional), then clamped.
 */
export function intensityForBrightness(brightness: number): number {
  const { referenceBrightness, brightnessSensitivity, intensityRange } = CONFIG.lighting;
  const ratio = Math.max(brightness, 1e-3) / referenceBrightness;
  return THREE.MathUtils.clamp(Math.pow(ratio, brightnessSensitivity), intensityRange[0], intensityRange[1]);
}

const roomHue = new THREE.Color(); // reused, so sampling allocates nothing

/** Room colour -> light colour: white, nudged towards the room's hue (not its brightness). */
export function lightColourForRoom(r: number, g: number, b: number, out: THREE.Color): THREE.Color {
  const maxChannel = Math.max(r, g, b, 1e-3);
  // Normalise so the brightest channel is 1: keeps the hue, drops the brightness.
  roomHue.setRGB(r / maxChannel, g / maxChannel, b / maxChannel);
  return out.setRGB(1, 1, 1).lerp(roomHue, CONFIG.lighting.colourTintStrength);
}

/** Reads the current video frame at tiny size and returns the room light estimate. */
export class RoomLightSampler {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CONFIG.lighting.sampleWidth;
    this.canvas.height = CONFIG.lighting.sampleHeight;
    // willReadFrequently keeps this tiny canvas on the CPU, making getImageData cheap.
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  sample(video: HTMLVideoElement, out: RoomLight): RoomLight | null {
    if (!this.context) return null;
    const { width, height } = this.canvas;
    this.context.drawImage(video, 0, 0, width, height);
    const { r, g, b, brightness } = averageColour(this.context.getImageData(0, 0, width, height).data);
    out.intensity = intensityForBrightness(brightness);
    lightColourForRoom(r, g, b, out.colour);
    return out;
  }
}
