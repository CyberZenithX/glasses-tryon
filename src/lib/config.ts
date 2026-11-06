// Every tunable value in the app lives here, with a note on what changing it does.
// Other modules import from this file instead of hard-coding numbers, so tuning
// the try-on never means hunting through the code.

export const CONFIG = {
  webcam: {
    // Requested camera resolution. The browser picks the closest mode it supports.
    // Lower values (e.g. 640x480) are cheaper to upload to the GPU each frame; try
    // that first if FPS is below target. Face tracking itself downsamples internally,
    // so resolution mostly affects how sharp the video looks, not tracking quality.
    idealWidth: 1280,
    idealHeight: 720,
    // Requested frame rate. Tracking runs once per new camera frame, so this caps FPS.
    idealFrameRate: 30,
  },

  tracker: {
    // Files are served from this app's own host (copied into /public), never a CDN.
    wasmBasePath: '/mediapipe/wasm',
    modelPath: '/mediapipe/face_landmarker.task',
    // Confidence thresholds (0..1). Higher = fewer false faces but tracking drops
    // out sooner in poor light or at steep angles. Lower = the opposite.
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  camera: {
    // These three values MUST match the virtual camera MediaPipe assumes when it
    // computes the face transformation matrix (see mediapipe/tasks/cc/vision/
    // face_geometry/face_geometry_from_landmarks_graph.cc). If the Three.js camera
    // differs, the glasses drift off the face as you move. Not a tuning knob.
    verticalFovDeg: 63,
    nearCm: 1, // MediaPipe's metric space is in centimetres
    farCm: 10000,
  },

  glasses: {
    // Draco decoder for compressed .glb files, served locally (drei would use a CDN).
    dracoDecoderPath: '/draco/',
    // How far in front of the nose-bridge skin the front of the frame sits, in cm.
    // Bigger = glasses float further from the face.
    frontGapFromNoseBridgeCm: 0.6,
    // Real glasses tilt slightly, with the lower rims closer to the cheeks
    // ("pantoscopic tilt"), and this tilt is added to every model. Positive = lower rims move in.
    pantoscopicTiltDeg: 6,
    // Depth (cm) of the slice at the front of a model that counts as "the frame
    // front" when auto-centring the lenses on the eyes. Temples are ignored.
    frontSliceDepthCm: 1.5,
    // How fast the glasses fade in/out when a face appears/disappears (seconds).
    fadeDurationSec: 0.25,
  },

  debug: {
    landmarkRadiusPx: 1.6, // size of each landmark dot in the debug view
    landmarkColor: '#3ee6a8',
    poseAxesLengthCm: 8, // length of the red/green/blue head axes in the debug view
    faceWireframeColor: '#3ee6a8', // canonical face mesh drawn on the face in debug view
  },
} as const;
