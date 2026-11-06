// The user's choices from the Style panel: lens tint, frame colour and a small
// personal fit (size, height). App keeps one of these; Glasses applies it to the
// model (materials.ts for the colours, a scale/offset for the fit).
import { CONFIG } from './config.ts';

export interface GlassesStyle {
  lensTint: keyof typeof CONFIG.style.lensTints;
  frameColourId: string;
  /** 100 = the automatic fit. */
  sizePercent: number;
  /** 0 = the automatic fit; positive = higher up the nose. */
  heightMm: number;
}

export const DEFAULT_STYLE: GlassesStyle = {
  lensTint: 'clear',
  frameColourId: 'original',
  sizePercent: 100,
  heightMm: 0,
};
