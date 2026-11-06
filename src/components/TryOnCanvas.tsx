// Sets up the Three.js canvas, its camera and global lighting. The camera copies
// MediaPipe's virtual camera (field of view, near/far planes) and the canvas has
// the same aspect ratio as the video, so a pose from MediaPipe lands on the right
// pixels. Reflections come from a locally bundled HDR studio environment.
import { Environment } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../lib/config.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import type { FaceTracker } from '../lib/faceTracker.ts';
import type { PerformanceMonitor } from '../lib/performance.ts';
import TryOnScene from './TryOnScene.tsx';
import VideoBackground from './VideoBackground.tsx';

// Render at up to 2x device pixels: sharp on retina screens, capped for speed on 3x phones.
const DEVICE_PIXEL_RATIO_RANGE: [number, number] = [1, 2];

interface TryOnCanvasProps {
  video: HTMLVideoElement;
  tracker: FaceTracker;
  model: GlassesModel | null;
  monitor: PerformanceMonitor;
  smoothingEnabled: boolean;
  showDebug: boolean;
  debugCanvas: HTMLCanvasElement | null;
  onFaceVisibleChange: (visible: boolean) => void;
}

export default function TryOnCanvas({ video, ...sceneProps }: TryOnCanvasProps) {
  return (
    <Canvas
      className="tryon-canvas"
      dpr={DEVICE_PIXEL_RATIO_RANGE}
      // Soft (PCF) shadow maps, for the frame's shadow on the face.
      shadows="soft"
      // Neutral tone mapping keeps frame colours true (ACES, the default, shifts
      // hues and crushes blacks, which makes black acetate look flat).
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
      }}
      // Camera sits at the origin looking down -Z, exactly like MediaPipe's camera.
      // R3F sets the aspect ratio from the canvas size, which matches the video.
      camera={{
        fov: CONFIG.camera.verticalFovDeg,
        near: CONFIG.camera.nearCm,
        far: CONFIG.camera.farCm,
        position: [0, 0, 0],
      }}
    >
      <Suspense fallback={null}>
        {/* Image-based lighting: reflections on frames and lenses. Not shown as a background. */}
        <Environment files={CONFIG.lighting.environmentMap} />
      </Suspense>
      <VideoBackground video={video} />
      <TryOnScene video={video} {...sceneProps} />
    </Canvas>
  );
}
