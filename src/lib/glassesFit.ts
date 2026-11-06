// Fits a loaded glasses model to the canonical face: rotates it to face the camera,
// scales it to its real frame width, and moves it so the lenses are centred on the
// eyes and the frame front rests just in front of the nose bridge. Runs once per
// model load (not per frame); the result is a fixed transform inside the head group.
import * as THREE from 'three';
import { eyeCentre, getCanonicalFace, LANDMARK } from './canonicalFace.ts';
import type { GlassesModel } from './catalog.ts';
import { CONFIG } from './config.ts';

const MM_PER_CM = 10;

export interface GlassesFit {
  rotation: THREE.Euler;
  scale: number;
  position: THREE.Vector3;
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

  // Scale: the widest extent across X is the frame width.
  const targetWidthCm = entry.frameWidthMm / MM_PER_CM;
  const scale = targetWidthCm / (bounds.max.x - bounds.min.x);

  // Frame front = vertices within a thin slice at the very front (max Z).
  // Centring on this slice (not the whole model) ignores the temple arms,
  // which often slope down and would pull the lenses too low.
  const sliceDepth = CONFIG.glasses.frontSliceDepthCm / scale;
  const front = new THREE.Box3().setFromPoints(points.filter((p) => p.z >= bounds.max.z - sliceDepth));
  const frontCentre = front.getCenter(new THREE.Vector3());

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

  return { rotation, scale, position };
}
