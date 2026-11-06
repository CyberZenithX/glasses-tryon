import { describe, expect, it } from 'vitest';
import { layoutSheet } from './comparisonImage.ts';
import { CONFIG } from './config.ts';

describe('layoutSheet', () => {
  it('places photos side by side, same size, without overlap', () => {
    const layout = layoutSheet(3, 0.8, 2);
    expect(layout.photos).toHaveLength(3);
    const [a, b, c] = layout.photos;
    expect(a?.height).toBe(CONFIG.compare.sheetPhotoHeightPx);
    expect(b?.width).toBe(a?.width);
    expect(b!.x).toBeGreaterThan(a!.x + a!.width);
    expect(c!.x + c!.width).toBeLessThan(layout.width);
  });

  it('grows taller with more footer lines', () => {
    expect(layoutSheet(2, 0.8, 3).height).toBeGreaterThan(layoutSheet(2, 0.8, 1).height);
  });
});
