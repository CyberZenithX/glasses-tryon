// Sets up the Three.js canvas and its camera. The camera copies MediaPipe's
// virtual camera (field of view, near/far planes) and the canvas has the same
// aspect ratio as the video, so a pose from MediaPipe lands on the right pixels.
import { Canvas } from '@react-three/fiber';
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
      // Camera sits at the origin looking down -Z, exactly like MediaPipe's camera.
      // R3F sets the aspect ratio from the canvas size, which matches the video.
      camera={{
        fov: CONFIG.camera.verticalFovDeg,
        near: CONFIG.camera.nearCm,
        far: CONFIG.camera.farCm,
        position: [0, 0, 0],
      }}
    >
      <VideoBackground video={video} />
      <TryOnScene video={video} {...sceneProps} />
    </Canvas>
  );
}
