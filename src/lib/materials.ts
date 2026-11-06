// Material set-up for loaded glasses models: makes lenses real glass (refraction +
// reflections), gives frames a believable finish (metal / acetate / plastic), and
// fades the glasses in and out when a face appears or disappears. Runs once per
// model load, except setFade, which the per-frame loop calls while fading.
import * as THREE from 'three';
import type { FrameFinish, GlassesModel } from './catalog.ts';
import { CONFIG } from './config.ts';

interface FadeInfo {
  baseOpacity: number;
  baseTransparent: boolean;
}

function forEachMesh(root: THREE.Object3D, visit: (mesh: THREE.Mesh, material: THREE.Material) => void): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => visit(object, material));
  });
}

/**
 * Multiplies every material's original opacity by `fade` (0 = invisible, 1 = normal).
 * While partly faded, materials are switched to transparent; at 1 they go back to
 * their original setting, so solid frames sort and render normally.
 */
export function setFade(root: THREE.Object3D, fade: number): void {
  forEachMesh(root, (_mesh, material) => {
    const info = (material.userData.fade ??= {
      baseOpacity: material.opacity,
      baseTransparent: material.transparent,
    }) as FadeInfo;
    material.opacity = info.baseOpacity * fade;
    const transparent = fade < 1 || info.baseTransparent;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true; // switching transparency changes the shader
    }
  });
}

// Physically based settings for each frame finish. Roughness 0 = mirror, 1 = matte.
// Clearcoat = a thin glossy layer on top (polished acetate has one).
const FINISHES: Record<FrameFinish, { metalness: number; roughness: number; clearcoat: number }> = {
  metal: { metalness: 1, roughness: 0.22, clearcoat: 0 },
  acetate: { metalness: 0, roughness: 0.3, clearcoat: 1 },
  plastic: { metalness: 0, roughness: 0.45, clearcoat: 0.3 },
};
// Material names that mean "this part is metal" whatever the frame finish (hinges, screws, chrome trims).
const METAL_NAME = /metal|chrom|hrom|steel|hinge|screw/i;
// Exactly "glass", or anything mentioning "lens" (not "glasses", a common name for the whole model).
const LENS_NAME = /^glass$|lens/i;
// A material this transparent is a lens, whatever its name.
const LENS_MAX_OPACITY = 0.5;

function isLens(material: THREE.Material, modelHasOneMaterial: boolean): boolean {
  if (modelHasOneMaterial) return false; // frame and lenses share one textured material: leave it as authored
  const transmission = material instanceof THREE.MeshPhysicalMaterial ? material.transmission : 0;
  return (
    LENS_NAME.test(material.name) ||
    transmission > 0 ||
    (material.transparent && material.opacity < LENS_MAX_OPACITY)
  );
}

/** Turns any standard material into a physical one (needed for transmission and clearcoat). */
function toPhysical(material: THREE.Material): THREE.MeshPhysicalMaterial {
  if (material instanceof THREE.MeshPhysicalMaterial) return material;
  const physical = new THREE.MeshPhysicalMaterial();
  if (material instanceof THREE.MeshStandardMaterial) {
    // Copy only the standard (shared) properties.
    THREE.MeshStandardMaterial.prototype.copy.call(physical, material);
  }
  return physical;
}

/**
 * Lenses: real glass. Transmission makes three.js render the scene behind the lens
 * (the video) and refract it, plus environment reflections on top; the artist's
 * colour becomes the tint, so sunglasses stay dark and the heart lenses stay pink.
 */
function makeLens(source: THREE.Material, modelScale: number): THREE.MeshPhysicalMaterial {
  const lens = toPhysical(source.clone());
  const tint = lens.color.clone();
  // A very dark base colour (often used to fake tint with opacity) would make the
  // glass opaque black under transmission, so tint by the artist's colour only
  // when it is a real colour; otherwise use a faint neutral tint.
  const MIN_TINT_LIGHTNESS = 0.25;
  const lightness = tint.getHSL({ h: 0, s: 0, l: 0 }).l;
  lens.color.set(lightness < MIN_TINT_LIGHTNESS ? CONFIG.glasses.clearLensTint : tint);
  lens.metalness = 0;
  lens.roughness = CONFIG.glasses.lensRoughness;
  lens.transmission = 1;
  lens.ior = CONFIG.glasses.lensIor;
  // three.js measures thickness in the mesh's own units, before our scaling, so
  // divide by the model's scale (otherwise a model scaled up 10x refracts like
  // 2 cm-thick glass and shows skin from the wrong place through the lens).
  lens.thickness = CONFIG.glasses.lensThicknessCm / modelScale;
  lens.clearcoat = 0; // a rough clear-coat on a lens looks like haze
  lens.specularIntensity = 1;
  lens.opacity = 1;
  lens.transparent = false; // transmission handles see-through itself
  lens.depthWrite = true;
  lens.side = THREE.DoubleSide;
  return lens;
}

function applyFrameFinish(source: THREE.Material, finish: FrameFinish): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source;
  const frame = toPhysical(source);
  const settings = METAL_NAME.test(source.name) ? FINISHES.metal : FINISHES[finish];
  frame.metalness = settings.metalness;
  frame.roughness = settings.roughness;
  frame.clearcoat = settings.clearcoat;
  frame.clearcoatRoughness = CONFIG.glasses.clearcoatRoughness;
  return frame;
}

/** Prepares a freshly loaded (cloned) model's materials and shadows. Runs once per load. */
export function prepareGlassesMaterials(root: THREE.Object3D, model: GlassesModel, modelScale: number): void {
  const uniqueMaterials = new Set<THREE.Material>();
  forEachMesh(root, (_mesh, material) => uniqueMaterials.add(material));
  const modelHasOneMaterial = uniqueMaterials.size === 1;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const source = object.material as THREE.Material;
    if (isLens(source, modelHasOneMaterial)) {
      object.material = makeLens(source, modelScale);
      object.castShadow = false; // clear glass casts almost no shadow
    } else {
      object.material = model.keepAuthoredMaterials ? source : applyFrameFinish(source, model.finish);
      // Frames cast a soft shadow onto the face. A model whose frame and lenses are
      // one material can't cast only the frame's shadow (its lenses would throw a
      // big dark patch on the cheeks), so it casts none.
      object.castShadow = !modelHasOneMaterial;
    }
  });
}
