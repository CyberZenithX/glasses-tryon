// The invisible "ear" shape that the temple arms disappear into (see HeadOccluder).
// It is placed from CONFIG.ear so that an arm aimed at the ear root (glassesFit.ts)
// stays visible up to the ear and is hidden from the moment it reaches it, from
// any camera angle: like a real arm, which tucks behind the top of the ear.
import * as THREE from 'three';
import { CONFIG } from './config.ts';

export interface EarVolume {
  /** Centre of the ellipsoid for the person's LEFT ear (+X); the right ear mirrors X. */
  centre: THREE.Vector3;
  radii: THREE.Vector3;
}

/**
 * One solid ellipsoid covering the ear and the gap between it and the skull.
 * Being solid matters: an arm *inside* it is hidden from every viewpoint, so we
 * don't have to model the thin ear flap and its exact angle to the head.
 *  - top: CONFIG.ear.helixAboveRootCm above the root (the ear rises above the arm);
 *  - inner side: insideHeadCm inside the root (so it holds the arm, which runs
 *    along the skull);
 *  - front, at the arm's height: exactly at the root, so the arm is visible up to
 *    the ear and vanishes there.
 */
export function earVolume(): EarVolume {
  const { rootCm, armRestHeightCm, helixAboveRootCm, insideHeadCm, occluderRadiiCm } = CONFIG.ear;
  const [rootX, rootY, rootZ] = rootCm;
  const [rx, ry, rz] = occluderRadiiCm;
  const centreX = rootX - insideHeadCm + rx;
  const centreY = rootY + helixAboveRootCm - ry;
  // Ellipsoid's front (max z) at the arm's height: centreZ + rz * sqrt(1 - (dy/ry)^2).
  // Put that front at the root's z.
  const dy = (rootY + armRestHeightCm - centreY) / ry;
  const centreZ = rootZ - rz * Math.sqrt(Math.max(0, 1 - dy * dy));
  return { centre: new THREE.Vector3(centreX, centreY, centreZ), radii: new THREE.Vector3(rx, ry, rz) };
}

/** True if `point` (head coordinates, cm) is inside either ear volume. */
export function isInsideEar(point: THREE.Vector3, ear: EarVolume = earVolume()): boolean {
  const x = (Math.abs(point.x) - ear.centre.x) / ear.radii.x;
  const y = (point.y - ear.centre.y) / ear.radii.y;
  const z = (point.z - ear.centre.z) / ear.radii.z;
  return x * x + y * y + z * z < 1;
}
