// The list of glasses users can try on. Adding a new design = drop a .glb file
// into public/models/ and add one entry here. Each model is auto-scaled to its
// real frame width and auto-centred on the eyes; the offsets fix the rest.

export interface ModelCredit {
  title: string;
  author: string;
  sourceUrl: string;
  license: 'CC0-1.0' | 'CC-BY-4.0';
}

/** How the frame material should look (see materials.ts for the physical values). */
export type FrameFinish = 'metal' | 'acetate' | 'plastic';

export interface GlassesModel {
  /** Stable id, also used in the share link (?frame=<id>). */
  id: string;
  /** Name shown in the picker. */
  name: string;
  /** Path of the .glb file, relative to the site root. */
  file: string;
  /** Small preview image for the picker (rendered from the model itself). */
  thumbnail?: string;
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
  /** Frame finish. Parts named like metal (hinges, screws, chrome) always get metal. */
  finish: FrameFinish;
  /**
   * Keep the artist's frame materials untouched (still upgrades lenses). For models
   * whose look depends on their own textures or whose frame and lenses share one material.
   */
  keepAuthoredMaterials?: boolean;
  /** Fine position adjustment after auto-centring, in cm (+X person's left, +Y up, +Z forward). */
  offsetCm?: [number, number, number];
  credit: ModelCredit;
}

// No model's real frame width was published by its author, so most use 140 mm
// (a typical adult medium frame). cuv-glasses was modelled at real scale (135 mm).
const DEFAULT_FRAME_WIDTH_MM = 140;
// Heart's width was chosen by eye on real faces (its author published no size).
const HEART_FRAME_WIDTH_MM = 130;
const FACE_LEFT = -90; // rotate a model whose front faces +X so it faces the camera
const FACE_RIGHT = 90; // rotate a model whose front faces -X so it faces the camera

export const CATALOG: GlassesModel[] = [
  {
    id: 'eder',
    name: 'Bold Square',
    file: '/models/eder-glasses.glb',
    thumbnail: '/thumbnails/eder.png',
    frameWidthMm: DEFAULT_FRAME_WIDTH_MM,
    finish: 'acetate',
    credit: { title: 'Glasses', author: 'Marius.Eder', sourceUrl: 'https://skfb.ly/6Ruqv', license: 'CC-BY-4.0' },
  },
  {
    id: 'tilley',
    name: 'Crystal Round',
    file: '/models/tilley-glasses.glb',
    thumbnail: '/thumbnails/tilley.png',
    frameWidthMm: DEFAULT_FRAME_WIDTH_MM,
    finish: 'acetate',
    keepAuthoredMaterials: true, // frame and lenses share one textured material
    credit: { title: 'Glasses', author: 'Peter Tilley', sourceUrl: 'https://skfb.ly/6ZUC6', license: 'CC-BY-4.0' },
  },
  {
    id: 'victory',
    name: 'Classic',
    file: '/models/albertvictory-glasses.glb',
    thumbnail: '/thumbnails/victory.png',
    frameWidthMm: DEFAULT_FRAME_WIDTH_MM,
    finish: 'acetate',
    rotationDeg: [0, FACE_LEFT, 0],
    credit: { title: 'Glasses', author: 'AlbertVictory', sourceUrl: 'https://skfb.ly/oyp9A', license: 'CC-BY-4.0' },
  },
  {
    id: 'kinokoda',
    name: 'Round Wire',
    file: '/models/kinokoda-glasses.glb',
    thumbnail: '/thumbnails/kinokoda.png',
    frameWidthMm: DEFAULT_FRAME_WIDTH_MM,
    finish: 'metal',
    rotationDeg: [0, FACE_RIGHT, 0],
    credit: { title: 'Glasses', author: 'Dokono Kinokoda', sourceUrl: 'https://skfb.ly/6StPQ', license: 'CC-BY-4.0' },
  },
  {
    id: 'cuv',
    name: 'Half Rim',
    file: '/models/cuv-glasses.glb',
    thumbnail: '/thumbnails/cuv.png',
    frameWidthMm: 135,
    finish: 'metal',
    keepAuthoredMaterials: true, // one textured material with its own transmission
    credit: { title: 'Glasses', author: 'C.U.V', sourceUrl: 'https://skfb.ly/oHPPq', license: 'CC-BY-4.0' },
  },
  {
    id: 'heart',
    name: 'Heart',
    file: '/models/yadomi-heart-glasses.glb',
    thumbnail: '/thumbnails/heart.png',
    // Narrower than the default: the hearts bulge out past the hinges and are much
    // taller than ordinary lenses, so at 140 mm they overhung the face. At 130 mm
    // the outer edges line up with the other frames'.
    frameWidthMm: HEART_FRAME_WIDTH_MM,
    finish: 'metal',
    credit: {
      title: 'Heart-shaped glasses',
      author: '🎀 ★彡[ꜰᴇʟɪx ʏᴀᴅᴏᴍɪ]彡★ 🎀',
      sourceUrl: 'https://skfb.ly/6ZNXP',
      license: 'CC-BY-4.0',
    },
  },
];
