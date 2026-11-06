// Loads one glasses model (.glb) and places it on the canonical face: scaled to its
// real width, lenses centred on the eyes, front resting on the nose bridge, with a
// slight natural tilt, with realistic materials and a soft contact shadow where the
// bridge rests. It lives inside the head group, so it follows the head pose.
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { getCanonicalFace, LANDMARK } from '../lib/canonicalFace.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { bendTemplesToEars, computeGlassesFit, tiltPivot as getTiltPivot } from '../lib/glassesFit.ts';
import { prepareGlassesMaterials } from '../lib/materials.ts';

interface GlassesProps {
  model: GlassesModel;
  /** The nose contact shadow only makes sense on a face (off for product shots). */
  showContactShadow?: boolean;
}

export default function Glasses({ model, showContactShadow = true }: GlassesProps) {
  const gltf = useGLTF(model.file, CONFIG.glasses.dracoDecoderPath);

  const { scene, fit, tiltPivot } = useMemo(() => {
    // Clone so per-instance changes (fit, fade) never leak into drei's shared cache.
    const scene = gltf.scene.clone(true);
    // Materials shared by several meshes stay shared (cloned once), so we can tell
    // how many distinct materials the artist made.
    const materialCopies = new Map<THREE.Material, THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material as THREE.Material;
      if (!materialCopies.has(original)) materialCopies.set(original, original.clone());
      object.material = materialCopies.get(original);
      object.geometry = object.geometry.clone(); // the arms get reshaped below
    });
    const fit = computeGlassesFit(scene, model);
    bendTemplesToEars(scene, fit);
    prepareGlassesMaterials(scene, model, fit.scale);
    return { scene, fit, tiltPivot: getTiltPivot() };
  }, [gltf, model]);

  // The tilt pivots around the nose bridge, like real glasses resting on the nose.
  const tiltRad = THREE.MathUtils.degToRad(CONFIG.glasses.pantoscopicTiltDeg);
  const offsetFromPivot = fit.position.clone().sub(tiltPivot);

  return (
    <>
      <group position={tiltPivot} rotation-x={tiltRad}>
        <group position={offsetFromPivot} rotation={fit.rotation} scale={fit.scale}>
          <primitive object={scene} />
        </group>
      </group>
      {showContactShadow && <NoseContactShadow />}
    </>
  );
}

// Where the bridge of the frame touches the nose, real glasses darken the skin a
// little (light can't get in there). A soft dark blob on the nose fakes this
// "contact shadow"; the key light's real shadow (see TryOnScene) adds the rest.
// The blob is a decal: a patch cut out of the face mesh itself, so it wraps around
// the nose. (A flat card would be cut by the nose ridge poking through it, which
// showed as a sharp light patch under thin bridges such as Heart and Round Wire.)
const NOSE_SHADOW_DROP_CM = 0.35; // centred slightly below the bridge landmark, where pads rest
const NOSE_SHADOW_DEPTH_CM = 4; // how deep the decal reaches into the face: covers the whole nose
const GRADIENT_SIZE_PX = 64;
// Nudges the decal's depth towards the camera, so it wins against the occluder,
// which has exactly the same surface (otherwise the two "z-fight" and flicker).
const DECAL_DEPTH_NUDGE = -4;

let noseShadowTexture: THREE.CanvasTexture | null = null;
function getNoseShadowTexture(): THREE.CanvasTexture {
  if (noseShadowTexture) return noseShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRADIENT_SIZE_PX;
  const context = canvas.getContext('2d');
  if (context) {
    const half = GRADIENT_SIZE_PX / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, GRADIENT_SIZE_PX, GRADIENT_SIZE_PX);
  }
  noseShadowTexture = new THREE.CanvasTexture(canvas);
  return noseShadowTexture;
}

/** Cuts the blob's patch out of the canonical face, around the nose bridge (head space, cm). */
function createNoseShadowGeometry(): THREE.BufferGeometry | null {
  const face = getCanonicalFace();
  const bridge = face.vertices[LANDMARK.noseBridge];
  if (!bridge) return null;
  const [width, height] = CONFIG.lighting.noseContactShadowSizeCm;
  const faceMesh = new THREE.Mesh(face.geometry); // DecalGeometry needs a mesh; this one is never drawn
  const centre = new THREE.Vector3(bridge.x, bridge.y - NOSE_SHADOW_DROP_CM, bridge.z);
  // Projected straight from the front (no rotation), like light falling on the face.
  return new DecalGeometry(faceMesh, centre, new THREE.Euler(), new THREE.Vector3(width, height, NOSE_SHADOW_DEPTH_CM));
}

function NoseContactShadow() {
  const geometry = useMemo(() => createNoseShadowGeometry(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        map={getNoseShadowTexture()}
        transparent
        opacity={CONFIG.lighting.noseContactShadowOpacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={DECAL_DEPTH_NUDGE}
        polygonOffsetUnits={DECAL_DEPTH_NUDGE}
        toneMapped={false}
      />
    </mesh>
  );
}
