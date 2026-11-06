// Wraps MediaPipe Face Landmarker: loads the model from this app's own host and
// runs it on one video frame at a time. This is the "AI" step of the data flow:
// video frame in -> 478 face landmarks + head pose matrix (the RAW pose) out.
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CONFIG } from './config.ts';

export interface FaceDetection {
  /** 478 points, x/y in 0..1 of the video frame (unmirrored), z = relative depth. */
  landmarks: NormalizedLandmark[];
  /**
   * 4x4 matrix (16 numbers, column-major) that places MediaPipe's "canonical face"
   * in camera space, in centimetres. This is the head pose the glasses follow.
   */
  poseMatrix: number[];
}

export interface FaceTracker {
  /** Runs the model on the current video frame. Returns null when no face is found. */
  detect(video: HTMLVideoElement, timestampMs: number): FaceDetection | null;
  close(): void;
}

export async function createFaceTracker(): Promise<FaceTracker> {
  const fileset = await FilesetResolver.forVisionTasks(CONFIG.tracker.wasmBasePath);
  const landmarker = await createLandmarker(fileset);

  return {
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      const landmarks = result.faceLandmarks[0];
      const matrix = result.facialTransformationMatrixes[0];
      if (!landmarks || !matrix) return null;
      return { landmarks, poseMatrix: matrix.data };
    },
    close() {
      landmarker.close();
    },
  };
}

// Prefer the GPU (much faster); fall back to the CPU on devices where the GPU
// delegate cannot start (some older browsers / GPUs).
async function createLandmarker(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: CONFIG.tracker.modelPath, delegate },
    runningMode: 'VIDEO' as const, // reuses the previous frame's result to track faster
    numFaces: 1,
    outputFacialTransformationMatrixes: true, // the head pose we anchor the glasses to
    outputFaceBlendshapes: false, // facial expressions: not needed, so skip the work
    minFaceDetectionConfidence: CONFIG.tracker.minFaceDetectionConfidence,
    minFacePresenceConfidence: CONFIG.tracker.minFacePresenceConfidence,
    minTrackingConfidence: CONFIG.tracker.minTrackingConfidence,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (gpuError) {
    console.warn('GPU face tracking unavailable, falling back to CPU:', gpuError);
    return FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}
