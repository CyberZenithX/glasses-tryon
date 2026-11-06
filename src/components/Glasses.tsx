// Loads one glasses model (.glb) and places it on the canonical face: scaled to its
// real width, lenses centred on the eyes, front resting on the nose bridge, with a
// slight natural tilt, with realistic materials and a soft contact shadow where the
// bridge rests. It lives inside the head group, so it follows the head pose.
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { eyeCentre, getCanonicalFace, LANDMARK } from '../lib/canonicalFace.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { bendTemplesToEars, computeGlassesFit } from '../lib/glassesFit.ts';
import { prepareGlassesMaterials } from '../lib/materials.ts';

export default function Glasses({ model }: { model: GlassesModel }) {
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
    const face = getCanonicalFace();
    const bridge = face.vertices[LANDMARK.noseBridge] ?? eyeCentre(face);
    const fit = computeGlassesFit(scene, model);
    bendTemplesToEars(scene, fit);
    prepareGlassesMaterials(scene, model, fit.scale);
    return { scene, fit, tiltPivot: bridge.clone() };
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
      <NoseContactShadow />
    </>
  );
}

// Where the bridge of the frame touches the nose, real glasses darken the skin a
// little (light can't get in there). A soft dark blob on the nose fakes this
// "contact shadow"; the key light's real shadow (see TryOnScene) adds the rest.
const NOSE_SHADOW_LIFT_CM = 0.08; // just in front of the skin, so it isn't hidden by the occluder
const NOSE_SHADOW_DROP_CM = 0.35; // centred slightly below the bridge landmark, where pads rest
const GRADIENT_SIZE_PX = 64;

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

function NoseContactShadow() {
  const bridge = getCanonicalFace().vertices[LANDMARK.noseBridge];
  if (!bridge) return null;
  const [width, height] = CONFIG.lighting.noseContactShadowSizeCm;
  return (
    <mesh position={[bridge.x, bridge.y - NOSE_SHADOW_DROP_CM, bridge.z + NOSE_SHADOW_LIFT_CM]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={getNoseShadowTexture()}
        transparent
        opacity={CONFIG.lighting.noseContactShadowOpacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
