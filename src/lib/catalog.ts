// The list of glasses users can try on. Adding a new design = drop a .glb file
// into public/models/ and add one entry here. Each model is auto-scaled to its
// real frame width and auto-centred on the eyes; the offsets fix the rest.

export interface ModelCredit {
  title: string;
  author: string;
  sourceUrl: string;
  license: 'CC0-1.0' | 'CC-BY-4.0';
}

export interface GlassesModel {
  /** Stable id, also used in the share link (?frame=<id>). */
  id: string;
  /** Name shown in the picker. */
  name: string;
  /** Path of the .glb file, relative to the site root. */
  file: string;
  /**
   * Real total frame width (hinge to hinge, across the front) in millimetres.
   * Typical adult frames are 130-145 mm. The model is scaled to exactly this width.
   */
  frameWidthMm: number;
  /**
   * Rotation (degrees around X, Y, Z) that turns the model so that its front faces
   * the camera (+Z) and its top points up (+Y). Depends on how the artist exported it.
   */
  rotationDeg?: [number, number, number];
  /** Fine position adjustment after auto-centring, in cm (+X person's left, +Y up, +Z forward). */
  offsetCm?: [number, number, number];
  credit: ModelCredit;
}

export const CATALOG: GlassesModel[] = [];
