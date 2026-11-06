// The per-frame loop and the head-anchored 3D content. Every frame:
//   new video frame? -> detect face (RAW pose) -> move the head group -> render.
// Everything that happens per frame lives in the single useFrame callback below,
// so the whole pipeline can be read top to bottom in one place.
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../lib/config.ts';
import { clearDebugCanvas, drawLandmarks } from '../lib/debugDraw.ts';
import type { FaceTracker } from '../lib/faceTracker.ts';
import { createPose, matrixFromPose, poseFromMediaPipeMatrix } from '../lib/poseMath.ts';

interface TryOnSceneProps {
  video: HTMLVideoElement;
  tracker: FaceTracker;
  showDebug: boolean;
  debugCanvas: HTMLCanvasElement | null;
  onFaceVisibleChange: (visible: boolean) => void;
}

// A positive priority tells R3F that this callback renders the frame itself,
// so detection, pose update and render happen in a fixed, known order.
const RENDER_PRIORITY = 1;

export default function TryOnScene({ video, tracker, showDebug, debugCanvas, onFaceVisibleChange }: TryOnSceneProps) {
  // The head group is moved by setting its matrix directly from the pose each frame.
  const headGroupRef = useRef<THREE.Group>(null);

  // Objects reused every frame (allocating per frame causes garbage-collection stutters).
  // Kept in a ref because it changes every frame without needing a React re-render.
  const frameStateRef = useRef({
    matrix: new THREE.Matrix4(),
    rawPose: createPose(),
    lastVideoTime: -1,
    faceVisible: false,
  });

  useEffect(() => {
    if (!showDebug && debugCanvas) clearDebugCanvas(debugCanvas);
  }, [showDebug, debugCanvas]);

  useFrame(({ gl, scene, camera }) => {
    const headGroup = headGroupRef.current;
    const frameState = frameStateRef.current;
    if (!headGroup) return;

    // 1. Only run the model when the camera has delivered a new frame.
    //    The screen may refresh at 60-120 Hz while the camera gives ~30 fps.
    const hasNewFrame = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== frameState.lastVideoTime;
    if (hasNewFrame) {
      frameState.lastVideoTime = video.currentTime;

      // 2. Face tracking -> RAW pose.
      const detection = tracker.detect(video, performance.now());
      const faceVisible = detection !== null;
      if (detection) {
        poseFromMediaPipeMatrix(detection.poseMatrix, frameState.matrix, frameState.rawPose);
        // 3. Move everything attached to the head (glasses, occluder, debug axes).
        matrixFromPose(frameState.rawPose, headGroup.matrix);
      }
      headGroup.visible = faceVisible;
      if (faceVisible !== frameState.faceVisible) {
        frameState.faceVisible = faceVisible;
        onFaceVisibleChange(faceVisible);
      }

      if (showDebug && debugCanvas) drawLandmarks(debugCanvas, detection?.landmarks ?? null);
    }

    // 4. Render video background + head content in one pass.
    gl.render(scene, camera);
  }, RENDER_PRIORITY);

  return (
    // matrixAutoUpdate=false: we write the group's matrix ourselves from the pose.
    <group ref={headGroupRef} matrixAutoUpdate={false} visible={false}>
      {showDebug && <axesHelper args={[CONFIG.debug.poseAxesLengthCm]} />}
    </group>
  );
}
