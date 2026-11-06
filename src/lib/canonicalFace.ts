// MediaPipe's "canonical face": the average 3D face (468 points, in cm) that the
// pose matrix is defined against. Applying the pose matrix to this mesh puts it
// exactly on the user's face, so we use it for the head occluder, the debug
// wireframe, and as the reference for where glasses sit (nose bridge, eyes).
// Source: google-ai-edge/mediapipe, face_geometry/data/canonical_face_model.obj (Apache-2.0).
import * as THREE from 'three';
import canonicalFaceObj from '../assets/canonical_face_model.obj?raw';

/** Landmark indices (same numbering as MediaPipe's 478 landmarks) we care about. */
export const LANDMARK = {
  noseBridge: 168, // between the eyes, where the glasses' bridge rests
  rightEyeOuter: 33, // "right" = the person's right
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
} as const;

export interface CanonicalFace {
  /** Vertex positions in cm; vertices[i] is landmark i. */
  vertices: THREE.Vector3[];
  /** Triangle mesh of the face surface (indexed, with normals). */
  geometry: THREE.BufferGeometry;
}

/**
 * Parses the small subset of the OBJ format this file uses:
 *   "v x y z"           one vertex
 *   "f a/t b/t c/t"     one triangle (1-based vertex index / texture index)
 */
export function parseObj(objText: string): CanonicalFace {
  const vertices: THREE.Vector3[] = [];
  const indices: number[] = [];
  for (const line of objText.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') {
      vertices.push(new THREE.Vector3(Number(parts[1]), Number(parts[2]), Number(parts[3])));
    } else if (parts[0] === 'f') {
      // Keep only the vertex index (before the first "/"); OBJ counts from 1.
      for (const corner of parts.slice(1, 4)) indices.push(Number(corner.split('/')[0]) - 1);
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { vertices, geometry };
}

let cachedFace: CanonicalFace | null = null;

/** The canonical face, parsed once and shared. */
export function getCanonicalFace(): CanonicalFace {
  cachedFace ??= parseObj(canonicalFaceObj);
  return cachedFace;
}

/** Midpoint of the two eyes' centres (each eye centre = middle of its corners), in cm. */
export function eyeCentre(face: CanonicalFace, out = new THREE.Vector3()): THREE.Vector3 {
  const v = face.vertices;
  out.set(0, 0, 0);
  for (const index of [LANDMARK.rightEyeOuter, LANDMARK.rightEyeInner, LANDMARK.leftEyeInner, LANDMARK.leftEyeOuter]) {
    const point = v[index];
    if (point) out.add(point);
  }
  return out.multiplyScalar(1 / 4);
}
