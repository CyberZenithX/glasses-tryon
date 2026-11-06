// Fits a loaded glasses model to the canonical face: rotates it to face the camera,
// scales it to its real frame width, and moves it so the lenses are centred on the
// eyes and the frame front rests just in front of the nose bridge. Runs once per
// model load (not per frame); the result is a fixed transform inside the head group.
// It also reshapes the temple arms so they reach the ears (see bendTemplesToEars).
import * as THREE from 'three';
import { eyeCentre, getCanonicalFace, LANDMARK } from './canonicalFace.ts';
import type { GlassesModel } from './catalog.ts';
import { CONFIG } from './config.ts';

const MM_PER_CM = 10;

export interface GlassesFit {
  rotation: THREE.Euler;
  scale: number;
  position: THREE.Vector3;
  /** Z (face space, cm) where the frame front ends and the temple arms begin. */
  hingeZ: number;
  /** Current length of the temple arms (hinge to tip) after scaling, in cm. */
  templeLengthCm: number;
}

/** Collects every vertex of every mesh in `root`, in root's coordinate space. */
function collectVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const points: THREE.Vector3[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    const meshToRoot = new THREE.Matrix4().multiplyMatrices(toRoot, object.matrixWorld);
    for (let i = 0; i < positions.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(meshToRoot));
    }
  });
  return points;
}

export function computeGlassesFit(model: THREE.Object3D, entry: GlassesModel): GlassesFit {
  const [rx = 0, ry = 0, rz = 0] = entry.rotationDeg ?? [0, 0, 0];
  const rotation = new THREE.Euler(
    THREE.MathUtils.degToRad(rx),
    THREE.MathUtils.degToRad(ry),
    THREE.MathUtils.degToRad(rz),
  );
  const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);

  // Vertices after the "face the camera" rotation, still in the artist's units.
  const points = collectVertices(model).map((p) => p.applyMatrix4(rotationMatrix));
  const bounds = new THREE.Box3().setFromPoints(points);

  // Frame front = vertices in a thin slice at the very front (max Z). Measuring
  // only the front ignores the temple arms, which on some models splay wider
  // than the frame or droop, and would distort the width and the centring.
  const sliceDepth = (bounds.max.z - bounds.min.z) * CONFIG.glasses.frontSliceFraction;
  const front = new THREE.Box3().setFromPoints(points.filter((p) => p.z >= bounds.max.z - sliceDepth));
  const frontCentre = front.getCenter(new THREE.Vector3());

  // Scale: the front's width across X becomes the real frame width.
  const targetWidthCm = entry.frameWidthMm / MM_PER_CM;
  const scale = targetWidthCm / (front.max.x - front.min.x);

  // Where the frame should go on the canonical face.
  const face = getCanonicalFace();
  const eyes = eyeCentre(face);
  const bridge = face.vertices[LANDMARK.noseBridge] ?? eyes;
  const target = new THREE.Vector3(0, eyes.y, bridge.z + CONFIG.glasses.frontGapFromNoseBridgeCm);

  // position = target - (scaled model point that should land on target)
  const anchor = new THREE.Vector3(frontCentre.x, frontCentre.y, bounds.max.z).multiplyScalar(scale);
  const position = target.sub(anchor);
  const [ox = 0, oy = 0, oz = 0] = entry.offsetCm ?? [0, 0, 0];
  position.add(new THREE.Vector3(ox, oy, oz));

  const hingeZ = position.z + scale * (bounds.max.z - sliceDepth);
  const tipZ = position.z + scale * bounds.min.z;
  return { rotation, scale, position, hingeZ, templeLengthCm: hingeZ - tipZ };
}

/**
 * Reshapes the temple arms (everything behind the hinge) so they rest on the ears:
 *  1. stretch/shrink them along the head to a standard length, because artists'
 *     arms vary a lot (some end before the ear, some far behind it);
 *  2. angle them slightly downwards, because rigid models have arms perpendicular
 *     to the front, and our pantoscopic tilt would otherwise point them up, above
 *     the ear. Real arms run back and slightly down to the top of the ear.
 * The frame front is untouched. Edits each mesh's own copy of its geometry, once.
 */
export function bendTemplesToEars(model: THREE.Object3D, fit: GlassesFit): void {
  const { templeLengthCm, templeSlopeDownDeg, pantoscopicTiltDeg, templeStretchRange } = CONFIG.glasses;
  const stretch = THREE.MathUtils.clamp(
    templeLengthCm / fit.templeLengthCm,
    templeStretchRange[0],
    templeStretchRange[1],
  );
  // The tilt is applied later around the nose bridge and lifts the arms by the same
  // angle, so the downward slope we bake in includes it.
  const slope = Math.tan(THREE.MathUtils.degToRad(templeSlopeDownDeg + pantoscopicTiltDeg));

  // Model space -> face space (before tilt), as placed by computeGlassesFit.
  const modelToFace = new THREE.Matrix4().compose(
    fit.position,
    new THREE.Quaternion().setFromEuler(fit.rotation),
    new THREE.Vector3(fit.scale, fit.scale, fit.scale),
  );
  model.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const point = new THREE.Vector3();

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const meshToFace = new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld).premultiply(modelToFace);
    const faceToMesh = meshToFace.clone().invert();
    const positions = object.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(meshToFace);
      const behindHinge = fit.hingeZ - point.z; // cm behind the hinge (positive = on the arm)
      if (behindHinge <= 0) continue;
      const newBehind = behindHinge * stretch;
      point.z = fit.hingeZ - newBehind;
      point.y -= newBehind * slope;
      point.applyMatrix4(faceToMesh);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  });
}
