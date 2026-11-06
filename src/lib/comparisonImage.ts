// Capture & Compare, the download: lays the rendered comparison photos side by side
// on one dark card with a title, the frame names and the model credits, and saves
// it as a PNG. Everything is drawn on a local canvas; nothing is uploaded.
import { CONFIG } from './config.ts';
import { downloadBlob } from './download.ts';

export interface SheetPhoto {
  url: string; // object URL of the rendered photo (PNG)
  name: string; // frame name shown under the photo
  credit: string; // "“Title” by Author (licence)", required for CC-BY models
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Sheet layout, in pixels. Generous spacing so it reads well as a phone screenshot too.
const PADDING = 72;
const GAP = 36;
const HEADER_HEIGHT = 150;
const LABEL_HEIGHT = 96;
const FOOTER_LINE_HEIGHT = 30;
const FOOTER_TOP_GAP = 28;
const PHOTO_RADIUS = 28;

const COLOURS = {
  background: '#0d1120',
  card: '#151a2c',
  border: 'rgba(255, 255, 255, 0.08)',
  title: '#f4f5fb',
  muted: '#9aa1b9',
  accent: '#7c6cf6',
};
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Where everything goes for `count` photos of `photoAspect` (width / height).
 * Pure, so it is unit tested; drawing follows it exactly.
 */
export function layoutSheet(count: number, photoAspect: number, footerLines: number) {
  const photoHeight = CONFIG.compare.sheetPhotoHeightPx;
  const photoWidth = Math.round(photoHeight * photoAspect);
  const width = PADDING * 2 + count * photoWidth + Math.max(count - 1, 0) * GAP;
  const photosTop = PADDING + HEADER_HEIGHT;
  const footerTop = photosTop + photoHeight + LABEL_HEIGHT + FOOTER_TOP_GAP;
  const height = footerTop + footerLines * FOOTER_LINE_HEIGHT + PADDING;
  const photos: Rect[] = Array.from({ length: count }, (_, index) => ({
    x: PADDING + index * (photoWidth + GAP),
    y: photosTop,
    width: photoWidth,
    height: photoHeight,
  }));
  return { width, height, photos, footerTop };
}

/** Draws the comparison sheet. Photos must all have the same size (one crop, one pose). */
export async function drawComparisonSheet(photos: SheetPhoto[], date: Date): Promise<HTMLCanvasElement> {
  const images = await Promise.all(photos.map((photo) => loadImage(photo.url)));
  const first = images[0];
  const aspect = first ? first.naturalWidth / first.naturalHeight : CONFIG.compare.photoAspect;
  const footer = [
    'Rendered on this device with Glasses Try-On. Nothing was uploaded.',
    `3D models: ${photos.map((photo) => `${photo.name}: ${photo.credit}`).join(' · ')}`,
  ];

  // Measure the footer wrap first (it decides the sheet height).
  const measure = document.createElement('canvas').getContext('2d');
  const provisional = layoutSheet(photos.length, aspect, 0);
  const footerFont = `400 20px ${FONT}`;
  let footerLines: string[] = footer;
  if (measure) {
    measure.font = footerFont;
    footerLines = footer.flatMap((line) => wrapText(measure, line, provisional.width - PADDING * 2));
  }
  const layout = layoutSheet(photos.length, aspect, footerLines.length);

  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');

  context.fillStyle = COLOURS.background;
  context.fillRect(0, 0, layout.width, layout.height);

  // Header: title and date on the left, app name on the right.
  context.textBaseline = 'alphabetic';
  context.fillStyle = COLOURS.title;
  context.font = `650 52px ${FONT}`;
  context.fillText('My frame comparison', PADDING, PADDING + 56);
  context.fillStyle = COLOURS.muted;
  context.font = `400 24px ${FONT}`;
  context.fillText(
    `Same photo, same pose · ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`,
    PADDING,
    PADDING + 100,
  );
  context.textAlign = 'right';
  context.font = `600 24px ${FONT}`;
  context.fillText('Glasses Try-On', layout.width - PADDING, PADDING + 56);
  context.textAlign = 'left';

  layout.photos.forEach((rect, index) => {
    const image = images[index];
    const photo = photos[index];
    if (!image || !photo) return;
    // Card behind photo + label, then the photo clipped to rounded corners.
    context.fillStyle = COLOURS.card;
    roundedRect(context, rect.x, rect.y, rect.width, rect.height + LABEL_HEIGHT, PHOTO_RADIUS);
    context.fill();
    context.strokeStyle = COLOURS.border;
    context.lineWidth = 2;
    context.stroke();
    context.save();
    roundedRect(context, rect.x, rect.y, rect.width, rect.height, PHOTO_RADIUS);
    context.clip();
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    context.restore();

    // Label: numbered accent dot + frame name.
    const labelMid = rect.y + rect.height + LABEL_HEIGHT / 2;
    const dotRadius = 20;
    const dotX = rect.x + 28 + dotRadius;
    context.fillStyle = COLOURS.accent;
    context.beginPath();
    context.arc(dotX, labelMid, dotRadius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = `700 22px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(index + 1), dotX, labelMid + 1);
    context.textAlign = 'left';
    context.fillStyle = COLOURS.title;
    context.font = `600 32px ${FONT}`;
    context.fillText(photo.name, dotX + dotRadius + 18, labelMid + 1);
    context.textBaseline = 'alphabetic';
  });

  context.fillStyle = COLOURS.muted;
  context.font = footerFont;
  context.textBaseline = 'top';
  footerLines.forEach((line, index) => context.fillText(line, PADDING, layout.footerTop + index * FOOTER_LINE_HEIGHT));
  return canvas;
}

/** Saves a canvas as a PNG download (no upload: the file is built in memory). */
export async function downloadCanvasAsPng(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  downloadBlob(blob, fileName);
  canvas.width = 0; // free the sheet's pixels now
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load a comparison photo'));
    image.src = url;
  });
}

// Path of a rectangle with rounded corners (CanvasRenderingContext2D.roundRect is
// missing on older Safari versions).
function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
