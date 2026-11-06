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
  /** Real frame width in cm (the front's width after scaling). */
  frameWidthCm: number;
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
  const target = new THREE.Vector3(
    0,
    eyes.y - CONFIG.glasses.lensCentreBelowEyesCm,
    bridge.z + CONFIG.glasses.frontGapFromNoseBridgeCm,
  );

  // position = target - (scaled model point that should land on target)
  const anchor = new THREE.Vector3(frontCentre.x, frontCentre.y, bounds.max.z).multiplyScalar(scale);
  const position = target.sub(anchor);
  const [ox = 0, oy = 0, oz = 0] = entry.offsetCm ?? [0, 0, 0];
  position.add(new THREE.Vector3(ox, oy, oz));

  const hingeZ = position.z + scale * (bounds.max.z - sliceDepth);
  const tipZ = position.z + scale * bounds.min.z;
  return { rotation, scale, position, hingeZ, frameWidthCm: targetWidthCm, templeLengthCm: hingeZ - tipZ };
}

/**
 * Reshapes the temple arms (everything behind the hinge) so they rest on the ears:
 *  0. swing arms that were modelled splayed open (as if lying on a table) back
 *     in around the hinge, so they run straight back along the head;
 *  1. stretch/shrink them along the head to a standard length, because artists'
 *     arms vary a lot (some end before the ear, some far behind it);
 *  2. angle them so they pass just over the ear root (CONFIG.ear). Hinges sit at
 *     different heights on different frames, so a fixed angle can't work: each
 *     model gets the angle that runs from its own hinge to the ear.
 * The frame front is untouched. Edits each mesh's own copy of its geometry, once.
 */
export function bendTemplesToEars(model: THREE.Object3D, fit: GlassesFit): void {
  const { templeLengthCm, templeStretchRange } = CONFIG.glasses;
  const stretch = THREE.MathUtils.clamp(
    templeLengthCm / fit.templeLengthCm,
    templeStretchRange[0],
    templeStretchRange[1],
  );

  // Model space -> face space (before tilt), as placed by computeGlassesFit.
  const modelToFace = new THREE.Matrix4().compose(
    fit.position,
    new THREE.Quaternion().setFromEuler(fit.rotation),
    new THREE.Vector3(fit.scale, fit.scale, fit.scale),
  );
  model.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const meshes: { mesh: THREE.Mesh; meshToFace: THREE.Matrix4 }[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const meshToFace = new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld).premultiply(modelToFace);
    meshes.push({ mesh: object, meshToFace });
  });

  const hingeHalfWidth = fit.frameWidthCm / 2; // the front is centred on x = 0
  const splayRad = measureArmSplay(meshes, fit.hingeZ, hingeHalfWidth);
  const slope = armSlopeToEar(meshes, fit.hingeZ, stretch);
  const point = new THREE.Vector3();

  for (const { mesh, meshToFace } of meshes) {
    const faceToMesh = meshToFace.clone().invert();
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(meshToFace);
      if (fit.hingeZ - point.z <= 0) continue; // frame front: untouched

      // 0. Un-splay: rotate around this side's hinge (x = ±half width, z = hingeZ).
      //    Left arm (x > 0) turns inwards one way, right arm the mirror way.
      const side = Math.sign(point.x) || 1;
      const dx = point.x - side * hingeHalfWidth;
      const dz = point.z - fit.hingeZ;
      const angle = side * splayRad;
      point.x = side * hingeHalfWidth + dx * Math.cos(angle) + dz * Math.sin(angle);
      point.z = fit.hingeZ - dx * Math.sin(angle) + dz * Math.cos(angle);

      const behindHinge = fit.hingeZ - point.z; // cm behind the hinge (positive = on the arm)
      const newBehind = behindHinge * stretch;
      point.z = fit.hingeZ - newBehind;
      point.y -= newBehind * slope;
      point.applyMatrix4(faceToMesh);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
}

/**
 * The pantoscopic tilt is applied later (in Glasses.tsx), around the nose bridge.
 * Arms are reshaped *before* that tilt, so to aim them at the ear we first undo the
 * tilt on the ear's position: "where will the ear be, in the untilted frame?".
 */
export function tiltPivot(): THREE.Vector3 {
  const face = getCanonicalFace();
  return (face.vertices[LANDMARK.noseBridge] ?? eyeCentre(face)).clone();
}

/**
 * Downward slope (drop in cm per cm travelled back) that brings the arms down onto
 * the ear root. We measure how high the arms already are where the ear is (after
 * stretching), and tilt them by exactly the amount that moves that height onto the
 * ear. Measuring at the ear (not at the hinge) works for any arm shape: straight,
 * already sloping, or curved, and ignores chunky frame fronts near the hinge.
 */
function armSlopeToEar(
  meshes: { mesh: THREE.Mesh; meshToFace: THREE.Matrix4 }[],
  hingeZ: number,
  stretch: number,
): number {
  const EAR_ZONE_HALF_DEPTH_CM = 1; // arm vertices within ±1 cm of the ear (front to back)
  const MAX_SLOPE = Math.tan(THREE.MathUtils.degToRad(30)); // guard against odd models

  // Ear root, moved into the untilted frame (rotate by -tilt about the pivot).
  const [, earY, earZ] = CONFIG.ear.rootCm;
  const pivot = tiltPivot();
  const ear = new THREE.Vector3(0, earY + CONFIG.ear.armRestHeightCm, earZ)
    .sub(pivot)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), -THREE.MathUtils.degToRad(CONFIG.glasses.pantoscopicTiltDeg))
    .add(pivot);
  const earBehindHinge = hingeZ - ear.z;

  // Average height of the (stretched) arms around the ear.
  const point = new THREE.Vector3();
  let sumY = 0;
  let count = 0;
  for (const { mesh, meshToFace } of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(meshToFace);
      const behind = (hingeZ - point.z) * stretch;
      if (behind > 0 && Math.abs(behind - earBehindHinge) <= EAR_ZONE_HALF_DEPTH_CM) {
        sumY += point.y;
        count++;
      }
    }
  }
  if (count === 0) return 0;
  const armYAtEar = sumY / count;
  const slope = (armYAtEar - ear.y) / earBehindHinge;
  return THREE.MathUtils.clamp(slope, -MAX_SLOPE, MAX_SLOPE);
}

/**
 * How far (radians) the arms open outwards from straight back. Measured from the
 * outermost point on the back 40% of the arms, relative to the hinge. Returns 0
 * for arms that are already straight (or point inwards): those are left alone.
 */
function measureArmSplay(
  meshes: { mesh: THREE.Mesh; meshToFace: THREE.Matrix4 }[],
  hingeZ: number,
  hingeHalfWidth: number,
): number {
  const REAR_PORTION = 0.6; // "back 40%" = more than 60% of the way to the tip
  const MIN_SPLAY_RAD = THREE.MathUtils.degToRad(CONFIG.glasses.minArmSplayToFixDeg);
  const point = new THREE.Vector3();
  let maxBehind = 0;
  for (const { mesh, meshToFace } of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(meshToFace);
      maxBehind = Math.max(maxBehind, hingeZ - point.z);
    }
  }
  let widest = 0;
  let widestBehind = 1;
  for (const { mesh, meshToFace } of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(meshToFace);
      const behind = hingeZ - point.z;
      if (behind > maxBehind * REAR_PORTION && Math.abs(point.x) - hingeHalfWidth > widest) {
        widest = Math.abs(point.x) - hingeHalfWidth;
        widestBehind = behind;
      }
    }
  }
  const splay = Math.atan2(widest, widestBehind);
  return splay > MIN_SPLAY_RAD ? splay : 0;
}
